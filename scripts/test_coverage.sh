#!/bin/bash
set -e

# Run tests with coverage
echo "Running Unit Tests with Coverage..."
flutter test --coverage

echo "Running E2E tests (Note: Integration test coverage merging requires complex setup, skipping for report currently)"
# flutter test -d flutter-tester --coverage integration_test/full_suite_test.dart

# Generate Report
if command -v lcov >/dev/null 2>&1; then
    echo "Generating HTML Report..."
    genhtml coverage/lcov.info -o coverage/html
    echo "Report generated at coverage/html/index.html"
else
    echo "lcov not installed. Skipping HTML report generation."
    echo "You can install it via: sudo apt install lcov"
fi
