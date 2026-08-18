import {
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from 'mercadopago';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não está configurada.`);
  return value;
}

function client() {
  return new MercadoPagoConfig({
    accessToken: requiredEnv('MERCADOPAGO_ACCESS_TOKEN'),
    options: { timeout: 10_000 },
  });
}

export function publicUrl(): string {
  return requiredEnv('PUBLIC_URL').replace(/\/$/, '');
}

export async function createCheckoutPreference(input: {
  localPaymentId: string;
  payerEmail: string;
  amountCents: number;
  durationDays: number;
}) {
  const preference = new Preference(client());
  const baseUrl = publicUrl();

  const result = await preference.create({
    body: {
      items: [
        {
          id: `gallery-access-${input.durationDays}-days`,
          title: `Acesso à plataforma por ${input.durationDays} dias`,
          description:
            'Pagamento único para criar e gerenciar sua galeria de fotos.',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: input.amountCents / 100,
          category_id: 'services',
        },
      ],
      payer: { email: input.payerEmail },
      external_reference: input.localPaymentId,
      metadata: { local_payment_id: input.localPaymentId },
      notification_url: `${baseUrl}/api/payments/webhook`,
      back_urls: {
        success: `${baseUrl}/pagamento?checkout=success`,
        pending: `${baseUrl}/pagamento?checkout=pending`,
        failure: `${baseUrl}/pagamento?checkout=failure`,
      },
      auto_return: 'approved',
      statement_descriptor: 'FOTO GALERIA',
    },
    requestOptions: { idempotencyKey: input.localPaymentId },
  });

  const useSandbox = process.env.MERCADOPAGO_USE_SANDBOX === 'true';
  const checkoutUrl = useSandbox
    ? result.sandbox_init_point
    : result.init_point;

  if (!result.id || !checkoutUrl) {
    throw new Error('O Mercado Pago não retornou uma URL de checkout.');
  }

  return {
    preferenceId: result.id,
    checkoutUrl,
  };
}

export async function fetchMercadoPagoPayment(externalPaymentId: string) {
  return new Payment(client()).get({ id: externalPaymentId });
}

export function validateMercadoPagoWebhook(input: {
  xSignature: string | string[] | undefined;
  xRequestId: string | string[] | undefined;
  dataId: string | string[] | undefined;
}) {
  WebhookSignatureValidator.validate({
    ...input,
    secret: requiredEnv('MERCADOPAGO_WEBHOOK_SECRET'),
    toleranceSeconds: 300,
  });
}
