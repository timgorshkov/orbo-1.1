/**
 * One-time script to generate a GramJS session string for the service account.
 *
 * Usage (run on server or local machine with the service account's phone):
 *   npx ts-node scripts/setup-tg-session.ts
 *
 * Prerequisites:
 *   1. Go to https://my.telegram.org → "API development tools"
 *   2. Create an app → get api_id and api_hash
 *   3. Set TG_SERVICE_API_ID and TG_SERVICE_API_HASH in your environment
 *
 * Output:
 *   The session string to put in TG_SERVICE_SESSION env var.
 */

import * as readline from 'readline'
import { TelegramClient, StringSession } from 'telegram'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r))

async function main() {
  const apiId = parseInt(process.env.TG_SERVICE_API_ID || '', 10)
  const apiHash = process.env.TG_SERVICE_API_HASH || ''

  if (!apiId || !apiHash) {
    console.error('Set TG_SERVICE_API_ID and TG_SERVICE_API_HASH first')
    process.exit(1)
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  })

  await client.start({
    phoneNumber: async () => ask('Phone number (with country code, e.g. +79001234567): '),
    password: async () => ask('2FA password (if set, else press Enter): '),
    phoneCode: async () => ask('Code from Telegram: '),
    onError: (err) => console.error(err),
  })

  const session = client.session.save() as unknown as string
  console.log('\n✅ Session string (add to TG_SERVICE_SESSION env var):\n')
  console.log(session)
  console.log('\nService account TG ID:', (await client.getMe()).id.toString())

  await client.disconnect()
  rl.close()
}

main().catch(console.error)
