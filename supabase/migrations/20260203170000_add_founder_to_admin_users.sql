-- Add Founder users to admin_users table for system admin access
-- This grants system admin access to all Founders

INSERT INTO admin_users (user_id, admin_role, permissions)
SELECT 
    p.id,
    'super_admin',
    '{"*": true}'::jsonb
FROM profiles p
WHERE p.role = 'Founder'
AND NOT EXISTS (
    SELECT 1 FROM admin_users au WHERE au.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;
