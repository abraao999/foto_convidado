function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export type EnvStatus = {
  mongo: boolean;
  jwt: boolean;
  r2: boolean;
  mercadopago: boolean;
  publicUrl: boolean;
  email: boolean;
  cron: boolean;
};

/** Presença de secrets — nunca devolve o valor. */
export function getEnvStatus(): EnvStatus {
  return {
    mongo: present('MONGODB_URI'),
    jwt: present('JWT_SECRET'),
    r2:
      present('R2_ACCOUNT_ID') &&
      present('R2_ACCESS_KEY_ID') &&
      present('R2_SECRET_ACCESS_KEY') &&
      present('R2_BUCKET_NAME'),
    mercadopago:
      present('MERCADOPAGO_ACCESS_TOKEN') &&
      present('MERCADOPAGO_WEBHOOK_SECRET'),
    publicUrl: present('PUBLIC_URL'),
    email: present('RESEND_API_KEY'),
    cron: present('CRON_SECRET'),
  };
}

export function missingEnvKeys(status: EnvStatus = getEnvStatus()) {
  return (Object.entries(status) as Array<[keyof EnvStatus, boolean]>)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
}

export function isProductionEnv() {
  return process.env.NODE_ENV === 'production';
}
