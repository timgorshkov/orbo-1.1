const { TelegramClient, sessions } = require('telegram');
const { StringSession } = sessions;
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  const apiId = parseInt(process.env.TG_SERVICE_API_ID, 10);
  const apiHash = process.env.TG_SERVICE_API_HASH;

  if (!apiId || !apiHash) {
    console.error('ERROR: TG_SERVICE_API_ID and TG_SERVICE_API_HASH must be set');
    process.exit(1);
  }

  console.log('API ID:', apiId);
  console.log('Connecting to Telegram...\n');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: '+56941592683',
    password: async () => {
      const pw = await ask('2FA password (press Enter if none): ');
      return pw || '';
    },
    phoneCode: async () => {
      const code = await ask('Enter code from Telegram: ');
      return code.trim();
    },
    onError: (err) => console.error('Error:', err.message || err),
  });

  const session = client.session.save();
  console.log('\n========== SESSION STRING ==========');
  console.log(session);
  console.log('====================================\n');
  console.log('Add this to .env as TG_SERVICE_SESSION=<string above>');

  await client.disconnect();
  rl.close();
  process.exit(0);
})().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
