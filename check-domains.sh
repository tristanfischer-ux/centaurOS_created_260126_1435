#!/bin/bash

echo "🔍 Checking Domain Status..."
echo "================================"
echo ""

echo "📍 centaurdynamics.io:"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" https://centaurdynamics.io
echo ""

echo "📍 centauros.io:"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" https://centauros.io
echo ""

echo "================================"
echo "✅ Status 307 = Working (redirect to /login)"
echo "⏳ Status 000 = SSL certificate pending"
echo ""
echo "Run this script again in a few minutes to check centauros.io"
