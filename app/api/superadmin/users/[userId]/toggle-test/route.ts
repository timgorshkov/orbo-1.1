import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { requireSuperadmin } from '@/lib/server/superadminGuard';
import { createAPILogger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/users/[userId]/toggle-test' });
  
  try {
    await requireSuperadmin();
    
    const { userId } = await params;
    const supabase = createAdminServer();
    
    // Get current status
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, is_test')
      .eq('id', userId)
      .single();
    
    if (fetchError || !user) {
      logger.warn({ user_id: userId, error: fetchError?.message }, 'User not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Toggle status
    const newStatus = !user.is_test;
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ is_test: newStatus })
      .eq('id', userId);
    
    if (updateError) {
      logger.error({ user_id: userId, error: updateError.message }, 'Error updating user test status');
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
    
    logger.info({ user_id: userId, is_test: newStatus }, 'User test status toggled');
    
    return NextResponse.json({ 
      success: true, 
      is_test: newStatus 
    });
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in toggle-test');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
