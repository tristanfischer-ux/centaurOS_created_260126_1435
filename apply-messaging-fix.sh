#!/bin/bash

# Apply the messaging infinite recursion fix to Supabase
# This script applies the migration to fix the RLS policy circular reference

echo "🔧 Applying messaging RLS fix..."
echo ""
echo "This will fix the 'infinite recursion detected in policy' error."
echo ""

# Apply the migration
npx supabase db push --linked --include-all

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "The messaging feature should now work correctly."
    echo "Try sending a message to verify the fix."
else
    echo ""
    echo "❌ Migration failed. Please try applying it manually:"
    echo ""
    echo "1. Go to your Supabase Dashboard"
    echo "2. Navigate to SQL Editor"
    echo "3. Copy and paste the contents of:"
    echo "   supabase/migrations/20260202120000_fix_conversation_participants_recursion.sql"
    echo "4. Run the SQL"
fi
