// Envío de emails. Con SMTP_URL usa cualquier servidor SMTP (propio, Gmail, Brevo…).
// Sin SMTP_URL escribe el link en el log: alcanza para uso personal (o usar `npm run cli -- user:confirm`).

import nodemailer from 'nodemailer'

import type { Config } from '../config'

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>
}

export function createMailer(cfg: Config): Mailer {
  if (!cfg.smtpUrl) {
    return {
      send: async (to, subject, text) => console.log(`[mail] (sin SMTP configurado) para ${to} — ${subject}\n${text}`),
    }
  }
  const transport = nodemailer.createTransport(cfg.smtpUrl)
  return {
    send: async (to, subject, text) => void (await transport.sendMail({ from: cfg.mailFrom, to, subject, text })),
  }
}
