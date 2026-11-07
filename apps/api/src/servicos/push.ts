/**
 * Notificações Web Push (navegador e app instalado como PWA).
 *
 * Não depende de conta externa: as chaves VAPID vêm de VAPID_PUBLICA/VAPID_PRIVADA
 * ou, se não existirem, são geradas uma vez e guardadas no banco (tabela configuracoes).
 * O push é só um aviso — a notificação já está gravada na central antes do envio.
 * Inscrições que o navegador invalidou (404/410) são desativadas automaticamente.
 */
import * as webpush from 'web-push';
import { and, eq, isNull } from 'drizzle-orm';
import { configuracoes, dispositivos } from '../db/schema.js';
import type { Db } from '../db/cliente.js';

export interface AvisoPush { titulo: string; corpo: string; url: string; tag?: string }

export interface ServicoPush {
  chavePublica(): Promise<string | null>;
  enviar(usuarioId: string, aviso: AvisoPush): Promise<number>;
}

type Chaves = { publicKey: string; privateKey: string };
type Enviar = (sub: webpush.PushSubscription, corpo: string, opcoes: webpush.RequestOptions) => Promise<unknown>;

async function obterChaves(db: Db): Promise<Chaves> {
  if (process.env.VAPID_PUBLICA && process.env.VAPID_PRIVADA) {
    return { publicKey: process.env.VAPID_PUBLICA, privateKey: process.env.VAPID_PRIVADA };
  }
  const ler = async () => (await db.select().from(configuracoes).where(eq(configuracoes.chave, 'vapid')))[0]?.valor as Chaves | undefined;
  const existentes = await ler();
  if (existentes) return existentes;
  // Primeira execução: gera e grava. Se outra instância gravou junto, vale a que ficou no banco.
  await db.insert(configuracoes).values({ chave: 'vapid', valor: webpush.generateVAPIDKeys() }).onConflictDoNothing();
  return (await ler())!;
}

export function webPush(db: Db, opts: { assunto?: string; enviar?: Enviar } = {}): ServicoPush {
  let chaves: Promise<Chaves> | null = null;
  const garantir = () => (chaves ??= obterChaves(db));
  const enviarBruto: Enviar = opts.enviar ?? ((sub, corpo, o) => webpush.sendNotification(sub, corpo, o));
  const assunto = opts.assunto ?? process.env.VAPID_ASSUNTO ?? 'mailto:contato@vrum.app';

  return {
    async chavePublica() { return (await garantir()).publicKey; },
    async enviar(usuarioId, aviso) {
      const c = await garantir();
      const alvos = await db.select().from(dispositivos).where(and(
        eq(dispositivos.usuarioId, usuarioId), eq(dispositivos.plataforma, 'WEB'), isNull(dispositivos.invalidadoEm),
      ));
      let enviados = 0;
      for (const d of alvos) {
        const sub = d.inscricaoWeb as webpush.PushSubscription | null;
        if (!sub?.endpoint) continue;
        try {
          await enviarBruto(sub, JSON.stringify(aviso), {
            TTL: 3600, urgency: 'high',
            vapidDetails: { subject: assunto, publicKey: c.publicKey, privateKey: c.privateKey },
          });
          enviados++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.update(dispositivos).set({ invalidadoEm: new Date() }).where(eq(dispositivos.id, d.id));
          } else {
            console.warn('Falha ao enviar push', status ?? (e as Error).message);
          }
        }
      }
      return enviados;
    },
  };
}
