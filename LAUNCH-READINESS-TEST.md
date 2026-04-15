# Launch Readiness Test — Pre-LinkedIn Release

## Status: IN PROGRESS

## Test 1: Homepage & Marketing Pages
- [ ] Homepage loads, all sections render
- [ ] Pricing page shows 5 tiers (Explorer, Seed, Startup Team, Professional, Enterprise)
- [ ] About page loads with correct company number
- [ ] Contact page loads with working form
- [ ] For-manufacturers page loads with correct CTA (?role=supplier)
- [ ] SEO: meta tags, JSON-LD, og:image present

## Test 2: Signup & Onboarding
- [ ] /join page loads with signup form
- [ ] Account creation works (email/password)
- [ ] Onboarding sequence appears (welcome, role selection)
- [ ] User lands on /today dashboard
- [ ] Sidebar shows correct tier (Explorer — Free)

## Test 3: Subscription Flow
- [ ] /settings/billing shows current plan + upgrade options
- [ ] Seed tier card visible with £19.99 price
- [ ] "Upgrade to Seed" button creates Stripe checkout
- [ ] Stripe checkout page loads with correct amount

## Test 4: Investor Pages
- [ ] /investors directory loads with investor cards
- [ ] Cards show name, type, location (browsable without limit)
- [ ] Clicking investor detail page works (counts as view)
- [ ] View counter shows remaining views
- [ ] After viewing, investor is in "library" (re-visit is free)
- [ ] Cap-hit overlay appears with upgrade + referral CTAs

## Test 5: Red Team (5 perspectives)
- [ ] Sceptical hardware founder: first impression, value clarity
- [ ] Growth marketer: conversion funnel, CTAs, friction points
- [ ] Investor evaluating for portfolio: credibility, data quality
- [ ] Competitor doing recon: what would they copy/attack
- [ ] Security tester: exposed data, rate limits, gating bypass

## Issues Found
(tracked below as discovered)
