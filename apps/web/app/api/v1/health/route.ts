export function GET() {
  return Response.json(
    {
      status: 'ok',
      interface: 'synthetic-demo',
      authenticatedApi: 'requires-configured-supabase',
      version: '0.1.0',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
