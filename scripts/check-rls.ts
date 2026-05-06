import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    
    const { data, error } = await supabase.rpc('execute_sql', {
        query: `
            SELECT
                cmd AS operation,
                policyname,
                qual AS using_condition,
                with_check AS check_condition
            FROM
                pg_policies
            WHERE
                tablename = 'cad_lab_projects';
        `
    });
    
    if (error) console.log("RPC Error:", error);
    else console.log(data);
}
main();
