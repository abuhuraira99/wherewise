# Product

## Platform

web

## Stack

delegated: Vite + React + TypeScript single-page app, MapLibre GL for the map and 3D, h3-js for hexagonal binning, d3 modules for charts, served by a Cloudflare Worker with static assets (the user's deploy target is their Cloudflare account, Workers/Pages). Chosen because every analysis runs client-side (data never leaves the browser) and the Worker adds a cached proxy for live public feeds.

## Users

People who hold spreadsheets of located events and have no GIS analyst and no ArcGIS licence: city service and 311 teams, NGO and humanitarian field coordinators, logistics, delivery and retail operations leads, clinic and public-health staff, local journalists, students and researchers. They open the tool at a desk with a CSV export in hand and need to answer "where is this happening, is it real, is it getting worse, and how do I show it to my boss / the public / my team".

## Product Purpose

Wherewise turns a raw event file into a defensible spatial answer and a finished communication product. It profiles the data, chooses correct cartographic symbology and labels, separates real clusters from visual artefacts with hot spot statistics, classifies where activity is rising, falling or persistently high over time, links charts to the map, and exports the product that fits the audience: a print poster, a live dashboard, or a written brief. Success: a non-specialist goes from CSV to a map they can defend, in minutes.

## Positioning

Most map makers draw what you give them. Wherewise argues with you: every map ships with a Map Honesty check that flags misleading choices (raw counts, too many classes, inconsistent breaks across time, colour-blind failures, 3D without a reason), and every visual pattern is tested against Getis-Ord Gi* before it is called a hot spot. It encodes the practice taught in Esri's "The Power of Where: Communicating with Maps" (2026) as working software.

## Operating Context

Desktop and laptop browsers first (Chrome, Edge, Firefox, Safari), tablets for viewing dashboards, phones for reading briefs. Typical inputs: CSV exports with latitude/longitude, a timestamp, a category column and numeric fields. Live public feeds are offered as demonstrations (USGS earthquakes). A bundled London Fire Brigade animal-rescue dataset (Open Government Licence) mirrors the course exercises.

## Capabilities and Constraints

- Client-side only processing; uploaded files are never sent to a server.
- Capabilities: data profiling (qualitative vs quantitative), symbology (single, unique values, graduated colour with natural breaks/quantile/equal interval, proportional size, multivariate size+colour+transparency), label classes with cartographic type conventions, layer/feature blend modes, a small safe expression language for calculated fields, kernel heat map, H3 hex binning, Getis-Ord Gi* with FDR correction, Mann-Kendall emerging-trend classes, small multiples with locked breaks, time animation, 3D extrusion and a space-time cube with guided camera bookmarks, linked charts (category, histogram, data clock, calendar heat chart, pop-up sparklines), audience-driven export (poster PNG with legend/north arrow/scale bar, dashboard view, printable brief).
- No accounts, no pricing, no customers yet. Do not invent users, testimonials, metrics or partnerships.

## Brand Commitments

Name: Wherewise. Built by Abu Huraira. The product is independent and not affiliated with or endorsed by Esri; Esri and ArcGIS are named only as the source of the training.

## Evidence on Hand

- The course itself: 6 sections, 55 lessons, certificate dated November 25, 2026.
- Real open datasets: USGS earthquake feed (public domain), London Fire Brigade animal rescues (OGL v3).
- No usage numbers, testimonials or press exist; none may be fabricated.

## Product Principles

1. The map must be defensible: test before you claim.
2. Choose the product for the audience, not the other way round.
3. Data stays with its owner.
4. Explain every automatic decision in plain language.
5. Fast on an ordinary laptop with tens of thousands of points.

## Accessibility & Inclusion

WCAG 2.2 AA contrast for UI text, keyboard reachable controls, colour-blind safe palettes by default with a simulation check, reduced-motion respected.
