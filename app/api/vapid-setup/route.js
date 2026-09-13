import webpush from "web-push";

export async function GET() {
  const keys = webpush.generateVAPIDKeys();

  return Response.json({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  });
}
