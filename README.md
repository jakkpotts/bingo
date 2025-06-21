# Bingo - Credit Card Generator

This is a simple web-based tool to generate valid credit card numbers for testing purposes. It is based on a python script that was refactored to a self-contained HTML/JavaScript application.

## How to use

1.  Open the `index.html` file in your web browser.
2.  Enter the desired BIN prefix, number of cards to generate, and a name.
3.  Check or uncheck the "Include Tracks" box to include or exclude track 1 and track 2 data.
4.  Click the "Generate" button.
5.  The generated card details will appear below the controls.

## Features

-   Generates valid credit card numbers using the Luhn algorithm.
-   Supports Visa, Mastercard, American Express, and Discover based on the BIN.
-   Generates random expiry dates and CVVs.
-   Can optionally generate track 1 and track 2 data. 