# Demo Account Credentials

All demo accounts are now fully configured and ready to use for testing.

## Working Credentials

| Role | Email | Password |
|------|-------|----------|
| **Founder** | demo.founder@forgeos.io | DemoFounder2026! |
| **Executive** | demo.executive@forgeos.io | DemoExecutive2026! |
| **Apprentice** | demo.apprentice@forgeos.io | DemoApprentice2026! |
| **VC** | demo.vc@forgeos.io | DemoVC2026! |
| **Supplier** | demo.supplier@forgeos.io | DemoSupplier2026! |
| **University** | demo.university@forgeos.io | DemoUniversity2026! |

## Quick Access

- **Login Page**: https://your-domain.vercel.app/login
- **Demo Hub**: https://your-domain.vercel.app/demo

## First Login Experience

After logging in, users land on the **Objectives page** (not Dashboard) where they see:

### "Discover ForgeOS" Objective

All demo accounts have a pre-populated discovery objective with 6 guided tasks:

1. **Explore Your Tasks** - Visit Tasks page, see views, create/assign tasks
2. **Review Your Team** - Check Team page, member profiles, invite features
3. **Browse the Marketplace** - Find Executives, Apprentices, providers
4. **Check Your Inbox** - Notifications and action items command center
5. **Explore Inspiration** - Resources, templates, playbooks library
6. **Visit The Guild** - Community knowledge sharing

Each task description guides users through actual ForgeOS features.

## Testing Demo Mode

Visit `/demo` to see all demo accounts with one-click access to pre-filled signup forms.

## Issue Resolution

The password issues were caused by missing profile records in the database. This has been fixed:

✅ All auth users exist  
✅ All profile records created  
✅ Logins should work now  

Try logging in again with any of the credentials above!
