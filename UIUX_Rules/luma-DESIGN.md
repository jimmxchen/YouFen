---
version: alpha
name: "Luma Light"
description: "Luma is an event discovery and creation platform with a light, airy design centered on a near-white canvas. The hero uses a large, expressive serif-weight sans-serif headline with a dual-color gradient accent (\"start here\" in pink and orange), surrounded by a floating mosaic of colorful event card thumbnails. The primary CTA is a high-contrast pill-shaped black button. The overall aesthetic is playful yet refined. generous whitespace, soft multi-layer shadows on event cards, and a tightly constrained content column (max 820px) that keeps focus on the central message."
colors:
  white: "#ffffff"
  black: "#131517"
  cranberry-pink: "#de475e"
  gray-90: "#333537"
  gray-60: "#939597"
typography:
  hero-headline:
    fontFamily: "-apple-system"
    fontSize: "80px"
    fontWeight: "500"
    lineHeight: "73.6px"
    letterSpacing: "-0.8px"
  section-heading:
    fontFamily: "-apple-system"
    fontSize: "40px"
    fontWeight: "500"
    lineHeight: "48px"
  subheading:
    fontFamily: "-apple-system"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "24px"
  body-large:
    fontFamily: "-apple-system"
    fontSize: "20px"
    fontWeight: "400"
    lineHeight: "30px"
  body-default:
    fontFamily: "-apple-system"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  body-medium:
    fontFamily: "-apple-system"
    fontSize: "16px"
    fontWeight: "500"
    lineHeight: "20.8px"
  label-default:
    fontFamily: "-apple-system"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "21px"
  label-small:
    fontFamily: "-apple-system"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "19.5px"
  cta-button:
    fontFamily: "-apple-system"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "21px"
rounded:
  small: "0.25rem"
  small-squircle: "0.5rem"
  default: "0.5rem"
  card: "0.75rem"
  squircle-large: "1rem"
  card-squircle: "1.5rem"
  modal-squircle: "2rem"
  pill-button: "15px"
  event-card-image: "11px"
  full-pill: "100px"
spacing:
  spacing-1: "2px"
  spacing-2: "4px"
  spacing-3: "8px"
  spacing-4: "9px"
  spacing-5: "10px"
  spacing-6: "12px"
  spacing-7: "14px"
  spacing-8: "16px"
  spacing-9: "18px"
  spacing-10: "20px"
  spacing-11: "24px"
  spacing-12: "32px"
  spacing-13: "40px"
  spacing-14: "48px"
  spacing-15: "64px"
  spacing-16: "96px"
---

## Overview

Luma is an event discovery and creation platform with a light, airy design centered on a near-white canvas. The hero uses a large, expressive serif-weight sans-serif headline with a dual-color gradient accent ("start here" in pink and orange), surrounded by a floating mosaic of colorful event card thumbnails. The primary CTA is a high-contrast pill-shaped black button. The overall aesthetic is playful yet refined. generous whitespace, soft multi-layer shadows on event cards, and a tightly constrained content column (max 820px) that keeps focus on the central message.

**Signature traits:**
- Single-family weight hierarchy: Builds hierarchy from -apple-system across 3 weights rather than multiple families.
- Soft, rounded geometry: Generous corner rounding up to 100px.

## Colors

The palette uses 5 validated color tokens across 1 theme profile. Semantic roles stay attached to observed usage so generation agents can choose accents without inventing new color meaning.

**Semantic naming:**
- **action-text** maps to `black`: Role "text" is grounded by usage context "Primary text, headings, borders, and links across the entire page".
- **action-primary** maps to `white`: Role "primary" is grounded by usage context "Page background, card surfaces, hero overlay, and CTA button text".
- **action-border** maps to `gray-60`: Role "border" is grounded by usage context "Subtle borders, secondary link text, and divider lines".

### Primary Brand
- **White** (#ffffff): Page background, card surfaces, hero overlay, and CTA button text. Role: primary. {authored: rgb(255, 255, 255), space: rgb, alpha: 0.66}

### Text Scale
- **Black** (#131517): Primary text, headings, borders, and links across the entire page. Role: text. {authored: rgb(19, 21, 23), space: rgb, alpha: 0.04}
- **Cranberry / Pink** (#de475e): Accent color used in headline gradient ('start here' pink word) and button/link highlights. Role: text. {authored: rgb(222, 71, 94), space: rgb}
- **Gray 90** (#333537): Secondary text and muted link states. Role: text. {authored: rgb(51, 53, 55), space: rgb}

### Interactive
- **Gray 60** (#939597): Subtle borders, secondary link text, and divider lines. Role: border. {authored: rgb(147, 149, 151), space: rgb}

## Typography

Typography uses -apple-system across extracted hierarchy roles. Keep hierarchy mapped to these token rows before adding decorative type styles.

Uses -apple-system throughout for a uniform feel. Weight range spans medium, semi-bold, regular. Sizes range from 13px to 80px.

### Font Roles
- **Headline Font**: -apple-system
- **Body Font**: -apple-system

### Type Scale Evidence
| Role | Font | Size | Weight | Line Height | Letter Spacing | Stack / Features | Notes |
|------|------|------|--------|-------------|----------------|------------------|-------|
| Primary hero heading — large, tight-tracked, medium weight | -apple-system | 80px | 500 | 73.6px | -0.8px | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Secondary section headings | -apple-system | 40px | 500 | 48px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Card titles, modal headings, and prominent labels | -apple-system | 20px | 600 | 24px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Hero subtext and introductory paragraph copy | -apple-system | 20px | 400 | 30px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Default body text throughout the page | -apple-system | 16px | 400 | 24px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Emphasized body text, nav items, and button labels | -apple-system | 16px | 500 | 20.8px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Secondary labels, metadata, and helper text | -apple-system | 14px | 400 | 21px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Fine print, timestamps, and tertiary metadata | -apple-system | 13px | 400 | 19.5px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |
| Button and pill link labels | -apple-system | 14px | 400 | 21px | normal | -apple-system, BlinkMacSystemFont, Apple Color Emoji, Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif | Extracted token |

## Layout

Responsive system uses 3 breakpoint tier(s): mobile, desktop, wide.

This system uses a 4px base grid with scale values 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 144, 160.

### Responsive Strategy
- **mobile (451-1000px)**: Constrain layout for small viewports and prioritize vertical stacking.
- **desktop (Unknown)**: Expand layout density and horizontal composition for wide viewports.
- **wide (>= 1921px)**: Stretch composition with generous gutters and wider layout spans.

### Spacing System
| Token | Value | Px | Notes |
|------|-------|----|-------|
| spacing-1 | 2px | 2 | Extracted spacing token |
| spacing-2 | 4px | 4 | Extracted spacing token |
| spacing-3 | 8px | 8 | Extracted spacing token |
| spacing-4 | 9px | 9 | Extracted spacing token |
| spacing-5 | 10px | 10 | Extracted spacing token |
| spacing-6 | 12px | 12 | Extracted spacing token |
| spacing-7 | 14px | 14 | Extracted spacing token |
| spacing-8 | 16px | 16 | Extracted spacing token |
| spacing-9 | 18px | 18 | Extracted spacing token |
| spacing-10 | 20px | 20 | Extracted spacing token |
| spacing-11 | 24px | 24 | Extracted spacing token |
| spacing-12 | 32px | 32 | Extracted spacing token |
| spacing-13 | 40px | 40 | Extracted spacing token |
| spacing-14 | 48px | 48 | Extracted spacing token |
| spacing-15 | 64px | 64 | Extracted spacing token |
| spacing-16 | 96px | 96 | Extracted spacing token |
| spacing-17 | 144px | 144 | Extracted spacing token |
| spacing-18 | 160px | 160 | Extracted spacing token |

## Elevation & Depth

Keep depth flat unless validated shadow or interaction evidence appears in the extraction payload. Do not invent shadows beyond this evidence boundary.

### Shadow Evidence
| Shadow Token | Layers | Details |
|--------------|--------|---------|
| n/a | 0 | No validated shadow payload |

### Interaction Signals
| Theme | Signal | Evidence |
|-------|--------|----------|
| Light | backdrop-filter | blur(16px) |
| Light | outline-style | solid |
| Light | outline-color | rgb(19, 21, 23) ; rgba(19, 21, 23, 0.36) ; rgba(19, 21, 23, 0.64) |
| Light | outline-width | 3px ; 2px ; 0px |
| Light | outline-offset | 0px ; 2px ; 6px |
| Light | transform | matrix(1, 0, 0, 1, 0, 0) ; matrix(1, 0, 0, 1, 0, -2) ; matrix(1, 0, 0, 1, 0, -239.469) |

## Shapes

Shape language maps directly to rounded tokens. Keep component corners consistent with the role mapping below before introducing bespoke geometry.

### Radius Roles
| Token | Value | Px | Role Mapping |
|------|-------|----|--------------|
| small | 0.25rem | 4 | Subtle corner |
| small-squircle | 0.5rem | 8 | Control corner |
| event-card-image | 11px | 11 | Control corner |
| card | 0.75rem | 12 | Control corner |
| pill / button | 15px | 15 | Card corner |
| squircle / large | 1rem | 16 | Card corner |
| card-squircle | 1.5rem | 24 | Large surface corner |
| modal-squircle | 2rem | 32 | Large surface corner |
| full-pill | 100px | 100 | Large surface corner |

### Geometry Evidence
| Radius Token | Shape | Units |
|--------------|-------|-------|
| small | 0.25rem | rem |
| small-squircle | 0.5rem | rem |
| default | 0.5rem | rem |
| card | 0.75rem | rem |
| squircle / large | 1rem | rem |
| card-squircle | 1.5rem | rem |
| modal-squircle | 2rem | rem |
| pill / button | 15px | px |
| event-card-image | 11px | px |
| full-pill | 100px | px |

## Components

(none detected)

## Do's and Don'ts

Guardrails protect Single-family weight hierarchy, Soft, rounded geometry without adding unsupported visual claims.

| Do | Don't |
|----|---------|
| Do maintain consistent spacing using the base grid | Don't make unsupported claims about absent visual features |
| Do maintain WCAG AA contrast ratios (4.5:1 for normal text) | Don't mix rounded and sharp corners in the same view |
| Do use the primary color only for the single most important action per screen |  |
| Do verify evidence before writing new design-system guidance |  |

## Responsive Evidence

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <= 450px | (max-width: 450px) |
| Mobile | <= 650px | (hover: hover) and (max-width: 650px) |
| Breakpoint 3 | <= 800px | (max-width: 800px) |
| Breakpoint 4 | <= 820px | (max-width: 820px) |
| Breakpoint 5 | <= 1000px | (max-width: 1000px) |
| Mobile | >= 451px | (hover: hover) and (min-width: 451px) |
| Desktop | >= 1921px | (min-width: 1921px) |
| Breakpoint 8 | Unknown | (hover: hover) |

## Agent Prompt Guide

### Example Component Prompts
- Create button component using validated primary color role and spacing tokens.
- Create card component with mapped radius role and evidence-backed elevation.
- Create form input component using inferred typography hierarchy and border roles.

### Iteration Guide
1. Start with extracted palette and typography roles only.
2. Map spacing and radius directly from token tables before visual polish.
3. Apply component patterns one section at a time and compare against source intent.
4. Keep elevation claims tied to explicit evidence in output.
5. Iterate with smallest diffs and re-check section hierarchy after each change.
