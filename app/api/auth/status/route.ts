import { createClientServer } from '@/lib/server/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClientServer();
  const { data: { user } } = await supabase.auth.getUser();

  return NextResponse.json({
    authenticated: !!user,
    user: user ? {
      id: user.id,
      email: user.email,
    } : null,
  });
}

