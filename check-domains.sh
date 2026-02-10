#!/bin/bash

echo "🔍 Checking Domain Status..."
echo "================================"
echo ""

echo "📍 fractionalforge.app:"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" https://fractionalforge.app
echo ""

echo "================================"
echo "✅ Status 307 = Working (redirect to /login)"
echo "⏳ Status 000 = SSL certificate pending"
