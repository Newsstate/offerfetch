# Times Prime Offers API

This project exposes **one single API endpoint** that returns **all offers in JSON format**.

## Endpoint

GET /api/offers

## Response
Returns cached offers from `data/offers.json`.

## How offers are updated
A GitHub Action runs daily to regenerate `offers.json`.

## Usage
Deploy to Vercel and call:

https://your-domain.vercel.app/api/offers
