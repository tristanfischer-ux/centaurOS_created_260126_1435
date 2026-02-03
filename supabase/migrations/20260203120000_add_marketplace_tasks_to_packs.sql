-- =============================================
-- MIGRATION: Add Marketplace Exploration Tasks to All Objective Packs
-- =============================================
-- This migration adds a natural-sounding task to each pack that encourages
-- founders to explore the marketplace for relevant expert advice and services.
-- Each task is customized to feel organic within the pack's workflow.

DO $$
DECLARE
    pack_record RECORD;
    max_order INTEGER;
    marketplace_title TEXT;
    marketplace_description TEXT;
BEGIN
    -- Loop through all objective packs
    FOR pack_record IN 
        SELECT id, title, category 
        FROM public.objective_packs
    LOOP
        -- Get the current max order_index for this pack
        SELECT COALESCE(MAX(order_index), 0) INTO max_order
        FROM public.pack_items
        WHERE pack_id = pack_record.id;
        
        -- Customize the marketplace task based on pack category and title
        -- This makes each suggestion feel natural and contextual
        CASE 
            -- HR/People tasks
            WHEN pack_record.category IN ('HR', 'Operations') AND pack_record.title LIKE '%Hiring%' THEN
                marketplace_title := 'Explore Executive Recruiters and HR Advisors';
                marketplace_description := 'Consider browsing the marketplace for executive recruiters, HR consultants, or talent advisors who can help refine your hiring strategy, source hard-to-find candidates, or provide guidance on compensation and interview processes.';
            
            WHEN pack_record.category = 'HR' AND pack_record.title LIKE '%Onboard%' THEN
                marketplace_title := 'Review HR Systems and Training Providers';
                marketplace_description := 'Explore the marketplace for HR software providers, onboarding platform specialists, or training consultants who can streamline your employee onboarding process and ensure compliance.';
            
            WHEN pack_record.category = 'HR' AND pack_record.title LIKE '%Performance%' THEN
                marketplace_title := 'Consider Organizational Development Advisors';
                marketplace_description := 'Browse the marketplace for organizational development consultants or performance management experts who can help design effective review frameworks and develop your team.';
            
            WHEN pack_record.category = 'HR' OR pack_record.title LIKE '%Culture%' THEN
                marketplace_title := 'Find Culture and People Advisors';
                marketplace_description := 'Explore the marketplace for culture consultants, executive coaches, or organizational design experts who have helped companies build strong, scalable team cultures.';
            
            -- Compliance/Legal tasks
            WHEN pack_record.category IN ('Compliance', 'Legal') THEN
                marketplace_title := 'Connect with Compliance Specialists';
                marketplace_description := 'Consider browsing the marketplace for compliance advisors, legal counsel, or audit preparation consultants who specialize in ' || 
                    CASE 
                        WHEN pack_record.title LIKE '%SOC%' THEN 'SOC 2 readiness'
                        WHEN pack_record.title LIKE '%GDPR%' OR pack_record.title LIKE '%CCPA%' THEN 'privacy regulations'
                        WHEN pack_record.title LIKE '%Vendor%' THEN 'vendor risk management'
                        ELSE 'your compliance needs'
                    END || '. They can review your approach, identify gaps, and accelerate your certification timeline.';
            
            -- Sales/Growth tasks
            WHEN pack_record.category IN ('Sales', 'Growth') OR pack_record.title LIKE '%Sales%' THEN
                marketplace_title := 'Explore Sales Consultants and GTM Advisors';
                marketplace_description := 'Browse the marketplace for sales methodology experts, go-to-market strategists, or revenue consultants who can help refine your sales process, optimize conversion rates, and scale your revenue operations.';
            
            WHEN pack_record.title LIKE '%Pricing%' OR pack_record.title LIKE '%Discovery%' THEN
                marketplace_title := 'Consider Product Marketing Advisors';
                marketplace_description := 'Explore the marketplace for product marketing consultants, pricing strategists, or customer research specialists who can validate your assumptions and help position your offering for maximum value capture.';
            
            -- Finance tasks
            WHEN pack_record.category = 'Finance' OR pack_record.title LIKE '%Fundraising%' THEN
                marketplace_title := 'Connect with Fundraising Advisors';
                marketplace_description := 'Browse the marketplace for fundraising consultants, pitch deck designers, or financial modeling experts who have helped founders successfully raise capital. They can provide pitch feedback, investor introductions, and due diligence preparation.';
            
            -- Technical/Engineering tasks
            WHEN pack_record.category IN ('Engineering', 'Security') OR pack_record.title LIKE '%Technical%' OR pack_record.title LIKE '%Infrastructure%' THEN
                marketplace_title := 'Find Technical Architecture Advisors';
                marketplace_description := 'Consider exploring the marketplace for technical advisors, DevOps consultants, or infrastructure specialists who can review your architecture, suggest optimizations, and help you avoid common scaling pitfalls.';
            
            WHEN pack_record.title LIKE '%Security%' THEN
                marketplace_title := 'Explore Security Consultants';
                marketplace_description := 'Browse the marketplace for cybersecurity experts, penetration testers, or security audit specialists who can independently assess your security posture and recommend hardening strategies.';
            
            -- Product/Launch tasks
            WHEN pack_record.category = 'Product' OR pack_record.title LIKE '%Launch%' OR pack_record.title LIKE '%MVP%' THEN
                marketplace_title := 'Consider Product Launch Advisors';
                marketplace_description := 'Explore the marketplace for product launch consultants, growth marketers, or go-to-market strategists who have successfully launched similar products. They can help with positioning, launch tactics, and early traction strategies.';
            
            -- Marketing tasks
            WHEN pack_record.category = 'Marketing' OR pack_record.title LIKE '%Marketing%' OR pack_record.title LIKE '%Content%' THEN
                marketplace_title := 'Find Marketing and Content Specialists';
                marketplace_description := 'Browse the marketplace for content strategists, SEO experts, or growth marketing consultants who can amplify your content efforts, optimize distribution channels, and help you reach your target audience more effectively.';
            
            -- Default fallback for any other category
            ELSE
                marketplace_title := 'Explore Relevant Advisors and Service Providers';
                marketplace_description := 'Consider browsing the marketplace for advisors, consultants, or service providers who specialize in this area. Expert guidance can help you move faster, avoid common mistakes, and achieve better outcomes.';
        END CASE;
        
        -- Insert the marketplace exploration task
        -- Positioned after initial planning but before final execution
        -- This is a natural point where founders might seek additional expertise
        INSERT INTO public.pack_items (pack_id, title, description, role, order_index)
        VALUES (
            pack_record.id,
            marketplace_title,
            marketplace_description,
            'Executive', -- Assigned to Executive since seeking advice is a founder decision
            max_order + 1 -- Add at the end for now (can be reordered in future)
        );
        
        RAISE NOTICE 'Added marketplace task to pack: %', pack_record.title;
    END LOOP;
    
    RAISE NOTICE 'Successfully added marketplace exploration tasks to all packs';
END $$;
