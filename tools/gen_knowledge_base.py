#!/usr/bin/env python3
"""
Generate a knowledge-base PDF for the Goodcall (or any other) AI agent.

Pulls the structured data the live site uses and renders it as a
clean, scannable document the agent can ingest as training material.

Usage:
    pip install weasyprint
    python3 tools/gen_knowledge_base.py
    # → writes goodcall-knowledge-base.pdf in the project root

To refresh after Sheet edits: re-run with FETCH_LIVE=1 to pull the
current CMS payload from the deployed Apps Script Web App. Without
that flag, uses the snapshot baked in below (so the script keeps
working in sandboxes / offline).
"""
from __future__ import annotations
import html
import json
import os
import sys
from datetime import date
from pathlib import Path

CMS_URL = ("https://script.google.com/macros/s/"
           "AKfycbwXv6r6Me-mdp9WFjCHQYDHcgEKbny-9_K8TX-yGgW40yTONhz6kAs3H96xM0tEDAhcJA/exec")

# ── Snapshot of the live CMS payload (Apr 2026). Used when FETCH_LIVE
# is unset. Pat can re-run with FETCH_LIVE=1 to pull fresh from the
# Sheet after any edits.
SNAPSHOT: dict = {
    "site": {
        "info_phone_display":  "330-406-9686",
        "sales_phone_display": "330-406-9682",
        "info_email":          "info@cruisethecreek.com",
        "sales_email":         "salesteam@cruisethecreek.com",
        "trailside_address":   "6685 Kirk Rd, Canfield, OH 44406",
        "adventures_address":  "Scholl Recreation Pavilion, Bears Den Rd, Youngstown, OH 44511",
        "authorized_brands":   ["Heybike", "Velotric", "Jasion", "Mooncool"],
        "fleet_size":          11,
        "fleet_mix":           "4 all-purpose, 1 high-step, 2 cruisers, 2 cargo, 2 e-trikes",
        "speed_limit":         "15 mph (strictly enforced on Mill Creek Bikeway)",
        "weight_limit":        "400 lbs rider weight limit",
        "rider_age_policy": (
            "Ages 11–14: e-Trikes only at Kirk Road, subject to staff approval.\n"
            "Ages 14–15: Class 1 & 2 e-bikes only. Parent/guardian-signed waiver, helmet required.\n"
            "Ages 16–17: All classes (incl. Class 3) with a parent/guardian-signed waiver.\n"
            "Ages 18+: All classes with a signed waiver.\n"
            "All minors must have a guardian-signed waiver AND a guardian present to ride."
        ),
        "ohio_law": (
            "Class 1 (pedal-assist, 20 mph), Class 2 (throttle, 20 mph), "
            "Class 3 (pedal-assist, 28 mph). No license, registration, or insurance "
            "required. Helmets recommended for all riders; not mandated by Ohio law for adults."
        ),
        "metropark_rules": (
            "Class 1 and 2 e-bikes permitted on all Mill Creek MetroParks paved trails. "
            "Class 3 not permitted on the trails. 15 mph max on bike trails, "
            "25 mph on park roadways. No e-bikes on hiking-only paths."
        ),
    },
    "contact_routing": [
        {"desk": "Info", "phone": "330-406-9686", "email": "info@cruisethecreek.com",
         "covers": "Rentals, tours, sponsorships, Bridge the Gap, general questions"},
        {"desk": "Sales", "phone": "330-406-9682", "email": "salesteam@cruisethecreek.com",
         "covers": "Test rides, e-bike purchases, repairs, tune-ups, trade-ins"},
    ],
    "locations": [
        {
            "name": "Kirk Road Trailhead (Trailside Journey)",
            "address": "6685 Kirk Rd, Canfield, OH 44406",
            "speed": "Cruising pace — limited to 15 mph",
            "vibe": "Flat, paved, car-free. 11+ miles of Mill Creek MetroParks Bikeway.",
            "best_for": "First-time riders, families, casual cruises",
            "reservations": ("Reservations are required, but walk-ups CAN be accommodated under the "
                             "right circumstances — tell callers to text first to check availability."),
            "parking": "Park on the LOWER level, then walk up the hill or take the steps to our location.",
            "arrival": "Arrive 15 minutes early for a required safety tutorial before the ride.",
            "what_to_expect": ("50-car parking lot, restrooms, water fountains, picnic pavilion. "
                              "Trail extends north toward Austintown and south toward Canfield."),
        },
        {
            "name": "Bears Den / Scholl Pavilion (Unleash Your Adventure)",
            "address": "Scholl Recreation Pavilion, Bears Den Rd, Youngstown, OH 44511",
            "speed": "Full experience — speeds up to 25 mph",
            "vibe": "Hilly, wooded, scenic. Goes through the heart of Mill Creek Park.",
            "best_for": "Confident riders, scenic adventures, exploring park interior",
            "reservations": ("STRICTLY a pickup & drop-off location — reservations are REQUIRED, "
                             "no walk-ups."),
            "parking": ("Park in front of the Scholl Recreation Pavilion. The e-bikes are delivered "
                        "right to the pavilion."),
            "arrival": "Arrive 15 minutes early for a required safety tutorial before the ride.",
            "what_to_expect": ("Loops past Lanterman's Mill, Suspension Bridge, "
                              "Lily Pond, Rose Garden."),
        },
    ],
    # ── Hourly rental rates (pricing.html) ───────────────────────────
    "hourly_pricing": {
        "rate_rule": ("Kirk Road starts at $25 for the first hour; Bears Den starts at $35 for the "
                      "first hour. Both add $10 for each additional hour."),
        "locations": [
            {"name": "Kirk Road (Trailside Journey)", "speed": "Limited to 15 mph",
             "tiers": [("1 Hour", "$25"), ("2 Hours", "$35"), ("3 Hours", "$45"),
                       ("4 Hours (Half Day)", "$55")]},
            {"name": "Bears Den (Unleash Your Adventure)", "speed": "Speeds up to 25 mph",
             "tiers": [("1 Hour", "$35"), ("2 Hours", "$45"), ("3 Hours", "$55"),
                       ("4 Hours (Half Day)", "$65")]},
        ],
        "extras": [
            {"location": "Kirk Road", "items": [
                ("Mist Fan", "$3.00", ""),
                ("Power Bank Charger", "$5.00", ""),
                ("Bluetooth Speaker", "$7.00", ""),
                ("V-Seat", "$3.00", "Gooch protection — Ranger model e-bikes"),
                ("Insulated Cooler", "$10.00", "1 available")]},
            {"location": "Bears Den", "items": [
                ("Insta360 Camera", "$39.99", "1 available"),
                ("Bluetooth Speaker", "$9.99", "2 available"),
                ("Insulated Cooler", "$10.00", "1 available")]},
        ],
        "riders": [
            {"group": "Child (5–12 yrs)", "note": "Both locations — added in the Peek 'Who's riding?' guest step",
             "tiers": [("1 Hour", "$7"), ("2 Hours", "$10"), ("3 Hours", "$13"), ("4 Hours", "$16")]},
            {"group": "Toddler Stroller", "note": "Both locations — added in the Peek 'Who's riding?' guest step",
             "tiers": [("1 Hour", "$10"), ("2 Hours", "$15"), ("3 Hours", "$20"), ("4 Hours", "$25")]},
        ],
    },
    # ── Extended Odyssey long-term rentals (long-term-rental.html) ───
    "odyssey": {
        "what": ("Take a foldable 500W e-bike on the road for a half-day up to a full week. Pick up at "
                 "the Youngstown shop, drive it anywhere (Pittsburgh, Lake Erie, Hocking Hills), return "
                 "when done. Class-2, road-legal, 20 mph, 30–45 mi range, charges from any outlet."),
        "deposit": "$200 refundable hold at pickup. Local drop-off/pickup within 25 mi for a flat $40.",
        "bikes": [
            {"name": "Step-Over", "best_for": "1–12 mi one way",
             "tiers": [("8 Hour (Half day)", "$65"), ("24 Hour (Full day)", "$75"),
                       ("2 Day", "$140"), ("3 Day", "$195"), ("4 Day", "$240"),
                       ("5 Day", "$285"), ("6 Day", "$330"), ("1 Week", "$365")]},
            {"name": "Step-Thru", "best_for": "1–20 mi one way",
             "tiers": [("8 Hour (Half day)", "$70"), ("24 Hour (Full day)", "$80"),
                       ("2 Day", "$150"), ("3 Day", "$210"), ("4 Day", "$265"),
                       ("5 Day", "$315"), ("6 Day", "$360"), ("1 Week", "$400")]},
        ],
        "book": "long-term-rental.html reservation form, or text the info desk at 330-406-9686.",
    },
    "brands": [
        {"brand": "Heybike",  "range": "$900–$2,000",
         "positioning": "Original fleet since 2022. Wide lineup — fat tires, cargo, step-thru, all-purpose. ~75% of rentals."},
        {"brand": "Velotric", "range": "$1,200–$2,500",
         "positioning": "Mid-to-premium tier. More traditional cycling feel. Popular for the Bridge the Gap program."},
        {"brand": "Jasion",   "range": "$700–$1,500",
         "positioning": "Budget-friendly without sacrificing performance. Folding fat tires, hunter-style, value commuters."},
        {"brand": "Mooncool", "range": "$700–$2,000",
         "positioning": "Cruisers, e-trikes (3-wheel for extra stability), value picks."},
    ],
    "services": [
        {"name": "Creek Ready Tune-Up", "price": "$125", "for": "ANY brand of e-bike",
         "includes": [
             "Premium deep clean & rust prevention",
             "Derailleur, brake & bearing adjustment",
             "Motor performance & controller diagnostics",
             "Battery health assessment",
             "Full safety inspection & professional test ride",
         ],
         "turnaround": "2–3 business days"},
        {"name": "Creek Ready Setup", "price": "$100 (with new bike purchase) / $225 (already-owned bike)",
         "for": "New e-bikes from CTC, or Heybike/Velotric/Jasion bought online",
         "includes": [
             "50-point safety certification",
             "Andrew's master assembly",
             "Ohio Rust-Belt Shield corrosion treatment",
             "Free 30-day break-in tune included",
             "Manufacturer liaison support for warranty claims",
         ],
         "turnaround": "Scheduled within 24 hours of payment"},
        {"name": "Video Diagnostics", "price": "Book online",
         "for": "Anyone stuck on assembly or seeing an error code",
         "includes": [
             "1-on-1 live video with our technician",
             "Error code diagnosis & troubleshooting",
             "Guided assembly support",
             "Velotric / Heybike / Jasion specialists",
             "No travel needed",
         ],
         "turnaround": "Same-day or next-day session"},
    ],
    "rentals": {
        "fleet": "11 e-bikes total: 4 all-purpose, 1 high-step, 2 cruisers, 2 cargo, 2 e-trikes",
        "included_per_rental": [
            "A properly fitted e-bike (sized to you)",
            "A properly fitted helmet",
            "Eyewear (sport-style glasses)",
            "Walkthrough of bike, controls, and safety basics",
            "Digital map of the local rides",
        ],
        "advance_booking": "Book 2–3 days ahead for weekends, longer for holidays. Weekday mornings often have same-day availability.",
        "groups": "Larger groups should reach out directly — birthday rides, family reunions, corporate outings all welcome.",
        "test_rides": "Free. $1 holding fee, no-show converts to 1-hour rental rate.",
        "stroller_addon": "Optional child-stroller attachment for kids under 60 lbs. Confirm availability before booking.",
        "pet_stroller":   "Optional small-pet carrier attachment. Confirm availability before booking.",
    },
    "bridge_the_gap": {
        "what":   "Rent-to-own program for the Mahoning Valley.",
        "terms": [
            "$25–$30 per week in bi-weekly payments",
            "15 bi-weekly payments total ($750–$900 program cost), then the bike is yours",
            "No credit checks",
            "No driver's license required",
            "Ride the bike the whole time you're paying",
        ],
        "monthly_equivalent": "$100–$120/month (vs $400–$600/mo on rideshare)",
        "bike_options": [
            {"style": "Step-Over",  "best_for": "1–12 mi one way", "price": "$50/biweekly"},
            {"style": "Step-Thru",  "best_for": "1–20 mi one way", "price": "$55/biweekly"},
        ],
        "apply": "bridge-the-gap.html → 'Apply Now', or text the info desk at 330-406-9686.",
        "early_termination": "Reach out — we'll work with you. Life happens.",
    },
    "sponsorship_packages": [
        {"name": "Trailside Journey Champion", "price": "$1,400",
         "benefits": [
             "Prominent logo placement on one e-bike at Trailside Journey location",
             "Dedicated social media campaign featuring the sponsored bike",
             "Exclusive invitation to our 'Thank You' sponsor event",
             "Complimentary Bronze Memberships for all employees",
         ],
         "perks_title": "Bronze Membership perks",
         "perks": [
             "65% off the first hour of any ride",
             "25% off each additional hour",
             "25% off accessories and add-ons",
         ]},
        {"name": "Mill Creek Explorer", "price": "$2,700", "featured": True,
         "benefits": [
             "Logo placement on two e-bikes — Trailside Journey + Unleash Your Adventure locations",
             "Quarterly social media features highlighting the partnership",
             "Media coverage at Bike Belmont, Panerathon, and other external biking events",
             "Complimentary Gold Memberships for all employees",
         ],
         "perks_title": "Gold Membership perks",
         "perks": [
             "75% off the first hour of any ride",
             "40% off each additional hour",
             "40% off accessories and add-ons",
         ]},
    ],
    "current_sponsors": [
        {"name": "YoGo BikeShare",   "rep": "Ronnell Elkins (CEO)", "phone": "",
         "bike": "Ranger S E-Bike · Trailside Journey",
         "about": "Family-owned micro-mobility business in Youngstown. 'Unlock · Ride · Return.'",
         "website": "yogobikeshare.com"},
        {"name": "Kim Blasko",       "rep": "Realtor for Howard Hanna", "phone": "330-951-5510",
         "bike": "CityRun E-Bike · Trailside Journey",
         "about": "Licensed Real Estate Agent, Million Dollar Producer. Residential Relocation Specialist.",
         "website": "(pending)"},
        {"name": "The MLO Bros",     "rep": "Isaac & Luke Schuster (realtors / loan officers)", "phone": "330-651-7081",
         "bike": "Ranger S E-Bike · Trailside Journey",
         "about": "One-stop shop for homebuyers and sellers — real estate + mortgage lending under one roof.",
         "website": "(pending)"},
    ],
    "journeys": {
        "south": [
            {"name": "MetroParks Farms", "where": "Canfield, OH",
             "distance": "9 miles round trip", "duration": "approx 40 min",
             "highlights": "Archery Range, Disc Golf Course, Adventure Barn (seasonal), Sunflower Field",
             "dining":     "AngeNetta's Cafe, Jr Grinders, Stonefruit Coffee Company"},
            {"name": "The Walnut Grove", "where": "Canfield, OH",
             "distance": "12 miles round trip", "duration": "approx 48 min",
             "highlights": "Hidden playground in the woods, dawn 'til dusk access",
             "dining":     "Jr Grinders, AngeNetta's Cafe, Stonefruit Coffee Company"},
        ],
        "north": [
            {"name": "Mahoning Avenue Trailhead", "where": "Austintown, OH",
             "distance": "5 miles round trip", "duration": "approx 24 min",
             "highlights": "Iconic overpass bridge over Mahoning Ave, family-friendly distance",
             "dining":     "Molnar's Concessions, Paladin Brewing"},
            {"name": "Niles Greenway · Central Park Trailhead", "where": "Niles, OH",
             "distance": "18 miles round trip", "duration": "72+ min",
             "highlights": "Niles Greenway bridge, McKinley Memorial, wooded trail",
             "dining":     "Dairy Queen, Stoneyard Grill, Cadence Coffee House, Niles Sons of Italy"},
        ],
    },
    "faqs": [],  # filled in below from the live snapshot
    "booking_troubleshooting": [],
    "accessories": [],
}

# ── FAQs from the live CMS payload — same content as the Faqs tab.
SNAPSHOT["faqs"] = [
    # Booking
    ("Booking", "How do I book a rental?",
     "Book online — pick a pickup location (Bears Den / Scholl Pavilion or Kirk Road Trailhead), "
     "choose how many bikes and a time block. You'll get a confirmation email with waiver forms and "
     "pickup details. Prefer the human touch? Text Pat at 330-406-9686."),
    ("Booking", "How far in advance should I book?",
     "Weekends and warm-weather afternoons fill up — book at least 2–3 days ahead for weekends, longer "
     "for holidays. Weekday mornings often have same-day availability. If you're flexible, message us and "
     "we'll fit you in."),
    ("Booking", "Can I book for a group?",
     "Yes. Our fleet has 11 e-bikes total — 4 all-purpose, 1 high-step, 2 cruisers, 2 cargo, and 2 e-trikes. "
     "Larger groups should reach out directly so we can confirm availability and the right mix. Birthday "
     "rides, family reunions, and corporate outings all welcome."),
    ("Booking", "Do I need to create an account?",
     "No account needed. Just an email so we can send your confirmation, waiver, and pickup instructions."),
    ("Booking", "What happens after I book?",
     "You'll get an email with: pickup location/date/time, waiver forms to sign before you arrive, "
     "contact details if anything changes, and helpful info about safety, gear, and what to expect. "
     "Show up about 10 minutes early so we can fit your bike, adjust seat and bars, and walk you through "
     "the controls."),

    # Test Rides
    ("Test Rides", "Can I try a bike before I buy?",
     "Absolutely. We encourage test rides — it's the best way to find the right fit. We don't carry every "
     "model on the floor, but our fleet gives you a feel for what to look for: throttle vs. pedal-assist, "
     "frame style, motor power, and seating position."),
    ("Test Rides", "How do I schedule a test ride?",
     "Use the 'Test Ride' booking link on the home page, or text our sales team directly at 330-406-9682. "
     "We'll get you on the calendar."),
    ("Test Rides", "Where should I do my first test ride?",
     "If it's your first time on an e-bike, we strongly recommend Kirk Road. The Mill Creek MetroParks "
     "Bikeway is flat, paved, and car-free — perfect for a safe first ride. Experienced riders can "
     "test at Bears Den / Scholl Pavilion for hills and real terrain."),
    ("Test Rides", "How long is a test ride?",
     "Long enough to make a real decision — typically 20–30 minutes. We're not on a stopwatch. "
     "If you want longer, ask."),
    ("Test Rides", "Is there a fee for a test ride?",
     "Test rides are free. There's a $1 holding fee — if it becomes a no-call/no-show, it converts "
     "into a 1-hour rental rate."),

    # Tours & Rentals
    ("Tours & Rentals", "What rental options are available?",
     "Three flavors today, with a fourth on the way: (1) Adventures — pickup at Bears Den, in the heart "
     "of Mill Creek Park. (2) Trailside — pickup at Kirk Road Trailhead, 11+ miles of paved bikeway. "
     "(3) Bridge the Gap — rent-to-own program. (4) Long Term — multi-month plans coming soon."),
    ("Tours & Rentals", "What's the difference between Adventures and Trailside?",
     "Adventures (Bears Den) — guided rides through Mill Creek Park's hidden corners: Lily Pond, "
     "Lanterman's Mill, the covered bridge. Hilly, wooded, scenic. Great for explorers. "
     "Trailside (Kirk Road) — flat, paved, family-friendly bikeway. Great for first-timers and casual cruises."),
    ("Tours & Rentals", "What's included with a rental?",
     "A properly fitted e-bike, a properly fitted helmet, eyewear (sport-style glasses), a walkthrough "
     "of the bike and controls, and a digital map of the local rides."),
    ("Tours & Rentals", "Can I bring my own helmet?",
     "Of course — bring your own helmet, glasses, gloves, padded shorts, anything you ride with already. "
     "We provide the basics free for everyone else."),
    ("Tours & Rentals", "Do you offer guided tours?",
     "The Adventures pickup at Bears Den puts you in the heart of Mill Creek Park, and we'll point you to "
     "the loops that match your group's pace. Custom guided experiences for groups, birthdays, and "
     "corporate outings can be arranged — text us to plan."),

    # Sales
    ("Sales", "What brands do you sell?",
     "Heybike (original fleet since 2022, ~75% of rentals), Velotric (mid-to-premium, traditional cycling "
     "feel), Jasion (budget-friendly value), and Mooncool (cruisers and 3-wheel e-trikes for extra stability)."),
    ("Sales", "How much do e-bikes cost?",
     "Lineup ranges from about $650 (Jasion) to about $2,500 (Velotric). Most riders land $900–$1,500 "
     "depending on motor power, range, and frame style."),
    ("Sales", "Do you assemble the bike for me?",
     "Yes. Every new e-bike goes through Creek Ready Setup ($100): Andrew's master assembly, 50-point "
     "safety check, Ohio Rust-Belt corrosion treatment, free 30-day break-in tune. Don't risk a DIY build "
     "on a 50-pound machine that sustains 28 mph."),
    ("Sales", "Do you deliver?",
     "Local delivery is available in the tri-county area for an affordable flat fee. Contact us for a quote."),
    ("Sales", "Do you take trade-ins?",
     "Case by case — based on brand, condition, and current demand. Text photos and the model to "
     "330-406-9682 for a quote."),

    # Bridge the Gap
    ("Bridge the Gap", "What is Bridge the Gap?",
     "Our rent-to-own program for the Mahoning Valley. Makes e-bike ownership accessible by spreading "
     "payments over time while you're using and enjoying the bike."),
    ("Bridge the Gap", "How does the program work?",
     "$25–$30 per week in bi-weekly payments. 15 bi-weekly payments total, then the bike is yours. "
     "No credit checks. No driver's license required. You're riding the bike the whole time you're paying."),
    ("Bridge the Gap", "Who qualifies?",
     "Built for residents who need reliable transportation but face barriers with traditional financing. "
     "Anyone of legal age can apply. Text the info desk at 330-406-9686 to start an application."),
    ("Bridge the Gap", "What if I want to stop early?",
     "Reach out — we'll work with you. Life happens, and we'd rather have an honest conversation than "
     "make this complicated."),

    # Safety
    ("Safety", "How old do you have to be to ride?",
     "Ages 11–14: e-Trikes at Kirk Road only, staff approval. "
     "Ages 14–15: Class 1 & 2 only, guardian-signed waiver, helmet required. "
     "Ages 16–17: All classes (incl. Class 3) with guardian-signed waiver. "
     "Ages 18+: All classes. All minors need a guardian-signed waiver AND a guardian present."),
    ("Safety", "What's the weight limit?",
     "400 lbs rider weight limit for maximum range, performance, and safety."),
    ("Safety", "Do I have to wear a helmet?",
     "Helmets are strongly recommended for every CTC rider regardless of age. Properly fitted helmet "
     "included free. Ohio law doesn't mandate helmets for adults, but we strongly encourage — these are "
     "70-pound machines that sustain 15–28 mph."),
    ("Safety", "Are e-bikes hard to ride?",
     "Not at all. If you can ride a regular bike, you can ride an e-bike. Pedal-assist makes hills feel "
     "flat and long distances feel short. Full tutorial before you head out. We reserve the right to "
     "cancel a rental if we don't feel confident in rider readiness — guest and pedestrian safety is "
     "non-negotiable."),
    ("Safety", "What if I crash or get hurt?",
     "Stop riding, get to safety, and text 330-406-9686 or 330-406-9682. If it's an emergency, call 911 "
     "first. We'll come to you."),
    ("Safety", "What if the bike breaks down on the trail?",
     "Text 330-406-9686 or 330-406-9682. We'll send a tech to fix it on the spot (e.g. flat tire) or bring "
     "you back to the shop. Then we'll swap you onto another bike or revise your charge for actual time used."),

    # Service
    ("Service", "Do you service bikes you didn't sell?",
     "Yes — the Creek Ready Tune-Up is for ANY brand of e-bike. If it has a battery and a motor, we'll "
     "look at it (we reserve the right to decline the job after inspection)."),
    ("Service", "How much is a tune-up?",
     "$125 for the comprehensive Creek Ready Tune-Up. Includes premium deep clean, rust prevention, "
     "derailleur/brake/bearing adjustment, motor + controller diagnostics, battery health assessment, "
     "and full safety inspection with professional test ride."),
    ("Service", "How long does a tune-up take?",
     "Most tune-ups are done in 2–3 business days. Heavier work or special-order parts can extend the "
     "timeline — we'll tell you up front."),
    ("Service", "What is 'Creek Ready Setup'?",
     "Master-level new-bike build, $100, performed by Andrew. Includes 50-point safety certification, "
     "Ohio Rust-Belt Shield corrosion treatment, free 30-day break-in tune, manufacturer-liaison support."),
    ("Service", "Do you offer remote support?",
     "Yes — Video Diagnostics. Book a live video call with our factory-trained technician. 1-on-1, "
     "error-code troubleshooting, guided assembly support. Velotric / Heybike / Jasion / Mooncool specialists."),
    ("Service", "What about warranty work?",
     "As authorized dealer for Heybike, Velotric, Jasion, and Mooncool, we handle warranty claims "
     "directly with the manufacturer. Bring the bike (and proof of purchase) to the shop."),

    # Policies
    ("Policies", "What's your cancellation policy on rentals?",
     "Cancel or reschedule with at least 24 hours' notice for a full refund. Inside 24 hours we may not "
     "refund in full, but we always work with you on weather, illness, or genuine emergencies. Text "
     "330-406-9686 as soon as you know."),
    ("Policies", "What if the weather is bad?",
     "If WE cancel for weather, full store credit or free reschedule — your call. Light rain isn't usually "
     "a reason to cancel; lightning, severe storms, ice, or unsafe trail conditions are. We reach out the "
     "morning of if it looks dicey."),
    ("Policies", "Can I get a refund on a tune-up?",
     "Once work has begun, parts and labor are non-refundable. If we haven't started, you can cancel "
     "any time."),
    ("Policies", "What if I damage the rental bike?",
     "Normal wear is on us. Rider negligence — collision, drop damage, missing parts — is on you per "
     "the waiver. We assess any damage when you return the bike and let you know before billing anything."),

    # Contact
    ("Contact", "What's the fastest way to reach you?",
     "Text 330-406-9686 (info desk) or 330-406-9682 (sales). We answer texts faster than calls or email — "
     "usually within an hour during the day. Non-urgent: info@cruisethecreek.com."),
    ("Contact", "Where are you located?",
     "Trailside Journey pickup: 6685 Kirk Rd, Canfield, OH 44406 — along the Mill Creek Bikeway. "
     "Unleash Your Adventure pickup: Bears Den / Scholl Recreational Pavilion (inside Mill Creek Park)."),
    ("Contact", "What are your hours?",
     "Hours vary seasonally — we book by appointment. Text or email to confirm a slot rather than show up "
     "to a closed shop."),
    ("Contact", "Can I just stop by?",
     "Best to book online for accurate availability. Walk-ins welcome when the showroom is staffed, but "
     "we're often out on rentals or service appointments — a heads-up means you'll catch us."),
]

SNAPSHOT["booking_troubleshooting"] = [
    ("Calendar shows no available dates",
     "Tap the ◀ ▶ arrows at the top of the calendar to scroll months. Greyed-out dates are fully booked — "
     "try the next available date. If nothing's open in the next 2 weeks, text Sales at 330-406-9682."),
    ("Calendar isn't loading",
     "Refresh the page once. If it still won't load, switch to Chrome or Safari, or text Sales at "
     "330-406-9682 and we can book over the phone."),
    ("Picked a bike but nothing happens",
     "After you add a bike, a 'Who will be riding?' popup opens. Tap + next to '16 Years or Older' to "
     "set the rider count to at least 1, THEN tap the green Save button at the bottom of the popup. "
     "Form moves on once every bike has at least one rider saved."),
    ("Continue button is greyed out",
     "Almost always means the 'Who will be riding?' popup wasn't Saved on one of the bikes. Scroll up to "
     "each bike in the cart, reopen its popup, ensure '16 Years or Older' is ≥ 1, hit Save. Continue "
     "activates once every bike has riders saved."),
    ("What is the Stroller Add-On?",
     "Optional — for kids under 60 lbs in a child stroller attached to one of our e-bikes. Leave at 0 if "
     "not needed. Text Sales at 330-406-9682 to confirm stroller availability before booking."),
    ("What is the Pet Stroller?",
     "Optional — small dog in a pet carrier attachment. Leave at 0 if not bringing a pet. Confirm "
     "availability before booking."),
    ("More riders than bikes",
     "Each rider 16+ needs their own e-bike. Kids under 60 lbs can ride in the Stroller Add-On attached "
     "to a bike. Otherwise, add more bikes — or text Sales at 330-406-9682 for help sizing."),
    ("Want more bikes than the slot shows available",
     "Fleet caps at 11 e-bikes total. For larger groups, text Sales at 330-406-9682 — we can sometimes "
     "shuffle inventory or open a custom slot."),
    ("No time slots showing for the date",
     "That date might be fully booked. Try the next day, or text Sales at 330-406-9682 — we occasionally "
     "have a private slot we can open up."),
    ("Address won't accept",
     "Type slowly and pick from the auto-suggest dropdown — Peek validates against that list. If it "
     "still won't take, use 6685 Kirk Rd, Canfield OH 44406 as a placeholder and we'll sort details at pickup."),
    ("Card was declined",
     "Try a different card, or text Sales at 330-406-9682 to take payment manually. We accept Visa, "
     "Mastercard, Discover, and Amex."),
    ("Don't want to pay online",
     "No problem — text Sales at 330-406-9682 with date and group size and we can hold the slot. "
     "Payment can happen at pickup."),
]

SNAPSHOT["accessories"] = [
    ("Bluewind Oversized Backrest Saddle", "Saddles & Seats",
     "Wide bicycle saddle with novel backrest design. Universal fit for e-bikes, exercise bikes, "
     "stationary road bikes."),
    ("Bluewind Noseless Oversized Saddle", "Saddles & Seats",
     "Wide backrest, noseless design for riders who want pressure off the perineum on long cruises."),
    ("Bluewind Wing-Padded Wide Saddle",  "Saddles & Seats",
     "Extra-wide cushion with comfort wings. Drop-in for Peloton, stationary bikes, e-bikes, cruisers."),
    ("Cloud-9 Cruiser Select Saddle",     "Saddles & Seats",
     "10.5″ × 10.75″ cruiser saddle, soft-touch black vinyl. Classic sit-up-and-cruise feel."),
    ("Cloud-9 Suspension Cruiser Saddle", "Saddles & Seats",
     "Built-in suspension and cruiser gel. Smooths out bumps without losing comfort."),
    ("Spring Suspension Seat Post",       "Seat Posts",
     "Shock-absorbing post — 27.2 mm, 30.9 mm, 31.6 mm. Check seat tube before ordering."),
    ("40-in-1 Ratcheting Screwdriver",    "Tools",
     "S2 steel bits with detachable ratchet handle. Bike tweaks, electronics repair, general DIY."),
]


def fetch_live() -> dict | None:
    try:
        import urllib.request
    except ImportError:
        return None
    try:
        with urllib.request.urlopen(CMS_URL + "?page=home&refresh=1", timeout=30) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        print(f"[warn] live fetch failed ({e}); using snapshot", file=sys.stderr)
        return None


def esc(s) -> str:
    return html.escape("" if s is None else str(s))


def build_html(data: dict) -> str:
    today = date.today().isoformat()
    site = data["site"]

    parts: list[str] = []
    parts.append(f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Cruise the Creek — Agent Knowledge Base</title>
<style>
@page {{ size: letter; margin: 0.6in; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a;
       font-size: 10.5pt; line-height: 1.45; }}
h1, h2, h3, h4 {{ color: #2D4A32; font-weight: 700; letter-spacing: 0.01em; }}
h1 {{ font-size: 22pt; margin: 0 0 4pt; }}
h2 {{ font-size: 14pt; margin: 18pt 0 6pt; border-bottom: 2px solid #C9A96E;
       padding-bottom: 3pt; page-break-after: avoid; }}
h3 {{ font-size: 12pt; margin: 12pt 0 4pt; color: #557159; page-break-after: avoid; }}
h4 {{ font-size: 10pt; margin: 8pt 0 2pt; text-transform: uppercase;
       letter-spacing: 0.06em; color: #a98843; }}
p  {{ margin: 0 0 6pt; }}
ul, ol {{ margin: 0 0 8pt 16pt; padding: 0; }}
li {{ margin: 0 0 2pt; }}
table {{ width: 100%; border-collapse: collapse; margin: 4pt 0 10pt;
         page-break-inside: avoid; }}
th, td {{ border: 1px solid #d8d2c1; padding: 4pt 6pt; vertical-align: top;
          text-align: left; }}
th {{ background: #F5F0E8; font-weight: 700; color: #2D4A32; }}
.subtitle {{ color: #5a5a5a; font-size: 10pt; margin-bottom: 12pt; }}
.callout {{ background: #fbf7ef; border-left: 3pt solid #C9A96E; padding: 8pt 10pt;
            margin: 6pt 0 10pt; }}
.qa {{ margin: 0 0 8pt; page-break-inside: avoid; }}
.qa .q {{ font-weight: 700; color: #2D4A32; }}
.qa .a {{ margin-left: 0; }}
.section-tag {{ display: inline-block; font-size: 7.5pt; font-weight: 700;
                letter-spacing: 0.08em; text-transform: uppercase;
                background: #6B8F71; color: #fff; padding: 1pt 6pt;
                border-radius: 2pt; margin-right: 4pt; vertical-align: 1pt; }}
.featured-tag {{ background: #C9A96E; }}
.small {{ font-size: 9pt; color: #5a5a5a; }}
.cover {{ text-align: center; padding: 60pt 0 30pt; }}
.cover h1 {{ font-size: 28pt; }}
.cover .sub {{ font-size: 12pt; color: #557159; margin-top: 6pt; }}
.toc {{ margin: 24pt 0; column-count: 2; column-gap: 24pt; font-size: 10pt; }}
.toc div {{ break-inside: avoid; margin-bottom: 3pt; }}
.toc .num {{ display: inline-block; width: 18pt; color: #a98843; font-weight: 700; }}
.page-break {{ page-break-before: always; }}
</style></head><body>""")

    # ── COVER + TOC ──────────────────────────────────────────────────
    parts.append(f"""<div class="cover">
<h1>Cruise the Creek</h1>
<div class="sub">Agent Knowledge Base · {esc(today)}</div>
<p style="margin-top:20pt;color:#5a5a5a;font-size:10pt;max-width:5in;margin-left:auto;margin-right:auto;">
This document gives your AI phone agent the structured facts about Cruise the Creek's
business — locations, brands, pricing, policies, FAQs, troubleshooting — so it can answer
caller questions accurately and route the rest to the right human.
</p>
</div>
<div class="toc">
  <div><span class="num">1.</span> Quick Reference</div>
  <div><span class="num">2.</span> Contact Routing</div>
  <div><span class="num">3.</span> Locations &amp; What to Expect on Arrival</div>
  <div><span class="num">4.</span> Hourly Rental Pricing &amp; Add-Ons</div>
  <div><span class="num">5.</span> Extended Odyssey (Long-Term Rentals)</div>
  <div><span class="num">6.</span> E-Bike Brands We Sell</div>
  <div><span class="num">7.</span> Services &amp; Pricing</div>
  <div><span class="num">8.</span> Rentals (What's Included)</div>
  <div><span class="num">9.</span> Bridge the Gap (Rent-to-Own)</div>
  <div><span class="num">10.</span> Sponsorship Packages</div>
  <div><span class="num">11.</span> Current Sponsors</div>
  <div><span class="num">12.</span> Trailside Journey Destinations</div>
  <div><span class="num">13.</span> Frequently Asked Questions</div>
  <div><span class="num">14.</span> Booking Troubleshooting</div>
  <div><span class="num">15.</span> Recommended Accessories</div>
</div>""")

    # ── 1. QUICK REFERENCE ──────────────────────────────────────────
    parts.append('<div class="page-break"></div><h2>1. Quick Reference</h2>')
    parts.append('<table>')
    parts.append(f'<tr><th>Business name</th><td>Cruise the Creek</td></tr>')
    parts.append(f'<tr><th>Info desk (rentals/tours/sponsorships)</th><td>{esc(site["info_phone_display"])} · {esc(site["info_email"])}</td></tr>')
    parts.append(f'<tr><th>Sales desk (test rides/purchases/repairs)</th><td>{esc(site["sales_phone_display"])} · {esc(site["sales_email"])}</td></tr>')
    parts.append(f'<tr><th>Primary pickup address</th><td>{esc(site["trailside_address"])}</td></tr>')
    parts.append(f'<tr><th>Secondary pickup</th><td>{esc(site["adventures_address"])}</td></tr>')
    parts.append(f'<tr><th>Authorized brands</th><td>{esc(" · ".join(site["authorized_brands"]))}</td></tr>')
    parts.append(f'<tr><th>Fleet size</th><td>{esc(site["fleet_size"])} e-bikes — {esc(site["fleet_mix"])}</td></tr>')
    parts.append(f'<tr><th>Speed limit on trail</th><td>{esc(site["speed_limit"])}</td></tr>')
    parts.append(f'<tr><th>Rider weight limit</th><td>{esc(site["weight_limit"])}</td></tr>')
    parts.append('</table>')

    parts.append('<h3>Ohio E-Bike Law (so the agent can correct customer misconceptions)</h3>')
    parts.append(f'<p>{esc(site["ohio_law"])}</p>')
    parts.append('<h3>Mill Creek MetroParks Rules</h3>')
    parts.append(f'<p>{esc(site["metropark_rules"])}</p>')
    parts.append('<h3>Rider Age Policy</h3>')
    parts.append(f'<p style="white-space:pre-line">{esc(site["rider_age_policy"])}</p>')

    # ── 2. CONTACT ROUTING ──────────────────────────────────────────
    parts.append('<h2>2. Contact Routing</h2>')
    parts.append('<p class="small">When a caller needs to reach a human, route based on intent:</p>')
    parts.append('<table><tr><th>Desk</th><th>Phone</th><th>Email</th><th>Use for…</th></tr>')
    for r in data["contact_routing"]:
        parts.append(f'<tr><td><strong>{esc(r["desk"])}</strong></td>'
                     f'<td>{esc(r["phone"])}</td><td>{esc(r["email"])}</td>'
                     f'<td>{esc(r["covers"])}</td></tr>')
    parts.append('</table>')
    parts.append('<div class="callout"><strong>Customer preference:</strong> '
                 'Texting is always faster than email — sales 330-406-9682, info 330-406-9686. '
                 'Encourage callers to text for faster response if they don\'t need to speak immediately.</div>')

    # ── 3. LOCATIONS ────────────────────────────────────────────────
    parts.append('<h2>3. Locations &amp; What to Expect on Arrival</h2>')
    for loc in data["locations"]:
        parts.append(f'<h3>{esc(loc["name"])}</h3>')
        parts.append(f'<p><strong>Address:</strong> {esc(loc["address"])}</p>')
        parts.append(f'<p><strong>Speed:</strong> {esc(loc["speed"])}</p>')
        parts.append(f'<p><strong>Vibe:</strong> {esc(loc["vibe"])}</p>')
        parts.append(f'<p><strong>Best for:</strong> {esc(loc["best_for"])}</p>')
        parts.append(f'<p><strong>Reservations:</strong> {esc(loc["reservations"])}</p>')
        parts.append(f'<p><strong>Parking:</strong> {esc(loc["parking"])}</p>')
        parts.append(f'<p><strong>On arrival:</strong> {esc(loc["arrival"])}</p>')
        parts.append(f'<p class="small">{esc(loc["what_to_expect"])}</p>')
    parts.append('<div class="callout"><strong>Both locations:</strong> riders must arrive '
                 '15 minutes early for a required safety tutorial before heading out.</div>')

    # ── 4. HOURLY RENTAL PRICING & ADD-ONS ──────────────────────────
    hp = data["hourly_pricing"]
    parts.append('<div class="page-break"></div><h2>4. Hourly Rental Pricing &amp; Add-Ons</h2>')
    parts.append(f'<p>{esc(hp["rate_rule"])}</p>')
    for loc in hp["locations"]:
        parts.append(f'<h3>{esc(loc["name"])} <span class="small">({esc(loc["speed"])})</span></h3>')
        parts.append('<table><tr><th>Duration</th><th>Price</th></tr>')
        for dur, price in loc["tiers"]:
            parts.append(f'<tr><td>{esc(dur)}</td><td>{esc(price)}</td></tr>')
        parts.append('</table>')
    parts.append('<h3>Add-Ons &amp; Extras (added at pickup)</h3>')
    for ex in hp["extras"]:
        parts.append(f'<h4>{esc(ex["location"])}</h4>')
        parts.append('<table><tr><th>Item</th><th>Price</th><th>Note</th></tr>')
        for item, price, note in ex["items"]:
            parts.append(f'<tr><td>{esc(item)}</td><td>{esc(price)}</td><td>{esc(note)}</td></tr>')
        parts.append('</table>')
    parts.append('<h3>Extra Riders &amp; Strollers</h3>')
    for rg in hp["riders"]:
        parts.append(f'<h4>{esc(rg["group"])}</h4>')
        parts.append(f'<p class="small">{esc(rg["note"])}</p>')
        parts.append('<table><tr><th>Duration</th><th>Price</th></tr>')
        for dur, price in rg["tiers"]:
            parts.append(f'<tr><td>{esc(dur)}</td><td>{esc(price)}</td></tr>')
        parts.append('</table>')

    # ── 5. EXTENDED ODYSSEY (LONG-TERM) ─────────────────────────────
    od = data["odyssey"]
    parts.append('<div class="page-break"></div><h2>5. Extended Odyssey (Long-Term Rentals)</h2>')
    parts.append(f'<p>{esc(od["what"])}</p>')
    parts.append(f'<p><strong>Deposit:</strong> {esc(od["deposit"])}</p>')
    for bike in od["bikes"]:
        parts.append(f'<h3>{esc(bike["name"])} <span class="small">(best for {esc(bike["best_for"])})</span></h3>')
        parts.append('<table><tr><th>Duration</th><th>Price</th></tr>')
        for dur, price in bike["tiers"]:
            parts.append(f'<tr><td>{esc(dur)}</td><td>{esc(price)}</td></tr>')
        parts.append('</table>')
    parts.append(f'<p><strong>Book:</strong> {esc(od["book"])}</p>')

    # ── 6. BRANDS ────────────────────────────────────────────────────
    parts.append('<div class="page-break"></div><h2>6. E-Bike Brands We Sell</h2>')
    parts.append('<table><tr><th>Brand</th><th>Price Range</th><th>Positioning</th></tr>')
    for b in data["brands"]:
        parts.append(f'<tr><td><strong>{esc(b["brand"])}</strong></td>'
                     f'<td>{esc(b["range"])}</td><td>{esc(b["positioning"])}</td></tr>')
    parts.append('</table>')
    parts.append('<p class="small">Most riders land $900–$1,500 depending on motor power, range, and frame style.</p>')

    # ── 5. SERVICES ──────────────────────────────────────────────────
    parts.append('<h2>7. Services & Pricing</h2>')
    for s in data["services"]:
        parts.append(f'<h3>{esc(s["name"])} — {esc(s["price"])}</h3>')
        parts.append(f'<p><strong>For:</strong> {esc(s["for"])}</p>')
        parts.append('<ul>')
        for inc in s["includes"]:
            parts.append(f'<li>{esc(inc)}</li>')
        parts.append('</ul>')
        parts.append(f'<p class="small"><strong>Turnaround:</strong> {esc(s["turnaround"])}</p>')

    # ── 6. RENTALS ───────────────────────────────────────────────────
    parts.append('<h2>8. Rentals (What\'s Included)</h2>')
    r = data["rentals"]
    parts.append(f'<p><strong>Fleet:</strong> {esc(r["fleet"])}</p>')
    parts.append('<h4>Included per rental</h4><ul>')
    for inc in r["included_per_rental"]:
        parts.append(f'<li>{esc(inc)}</li>')
    parts.append('</ul>')
    parts.append('<table>')
    parts.append(f'<tr><th>Advance booking</th><td>{esc(r["advance_booking"])}</td></tr>')
    parts.append(f'<tr><th>Groups</th><td>{esc(r["groups"])}</td></tr>')
    parts.append(f'<tr><th>Test rides</th><td>{esc(r["test_rides"])}</td></tr>')
    parts.append(f'<tr><th>Stroller add-on</th><td>{esc(r["stroller_addon"])}</td></tr>')
    parts.append(f'<tr><th>Pet stroller</th><td>{esc(r["pet_stroller"])}</td></tr>')
    parts.append('</table>')

    # ── 7. BRIDGE THE GAP ────────────────────────────────────────────
    parts.append('<h2>9. Bridge the Gap (Rent-to-Own)</h2>')
    btg = data["bridge_the_gap"]
    parts.append(f'<p>{esc(btg["what"])}</p>')
    parts.append('<h4>Terms</h4><ul>')
    for t in btg["terms"]:
        parts.append(f'<li>{esc(t)}</li>')
    parts.append('</ul>')
    parts.append(f'<p><strong>Monthly equivalent:</strong> {esc(btg["monthly_equivalent"])}</p>')
    parts.append('<h4>Bike options</h4>')
    parts.append('<table><tr><th>Style</th><th>Best for</th><th>Price</th></tr>')
    for b in btg["bike_options"]:
        parts.append(f'<tr><td>{esc(b["style"])}</td><td>{esc(b["best_for"])}</td>'
                     f'<td>{esc(b["price"])}</td></tr>')
    parts.append('</table>')
    parts.append(f'<p><strong>Apply:</strong> {esc(btg["apply"])}</p>')
    parts.append(f'<p><strong>Early termination:</strong> {esc(btg["early_termination"])}</p>')

    # ── 8. SPONSORSHIP PACKAGES ──────────────────────────────────────
    parts.append('<div class="page-break"></div><h2>10. Sponsorship Packages</h2>')
    for p in data["sponsorship_packages"]:
        feat = ' <span class="section-tag featured-tag">Featured</span>' if p.get("featured") else ''
        parts.append(f'<h3>{esc(p["name"])} — {esc(p["price"])}{feat}</h3>')
        parts.append('<h4>What sponsors get</h4><ul>')
        for ben in p["benefits"]:
            parts.append(f'<li>{esc(ben)}</li>')
        parts.append('</ul>')
        parts.append(f'<h4>{esc(p["perks_title"])}</h4><ul>')
        for pk in p["perks"]:
            parts.append(f'<li>{esc(pk)}</li>')
        parts.append('</ul>')

    # ── 9. CURRENT SPONSORS ──────────────────────────────────────────
    parts.append('<h2>11. Current Sponsors</h2>')
    parts.append('<p class="small">If a caller asks "who sponsors you" or wants to talk to one of your sponsors:</p>')
    parts.append('<table><tr><th>Sponsor</th><th>Contact</th><th>Bike</th><th>About</th></tr>')
    for sp in data["current_sponsors"]:
        contact_bits = [sp["rep"]]
        if sp.get("phone"): contact_bits.append(sp["phone"])
        if sp.get("website"): contact_bits.append(sp["website"])
        parts.append(f'<tr><td><strong>{esc(sp["name"])}</strong></td>'
                     f'<td>{esc(" · ".join(contact_bits))}</td>'
                     f'<td>{esc(sp["bike"])}</td>'
                     f'<td>{esc(sp["about"])}</td></tr>')
    parts.append('</table>')

    # ── 10. TRAILSIDE JOURNEYS ───────────────────────────────────────
    parts.append('<h2>12. Trailside Journey Destinations</h2>')
    parts.append('<p class="small">From the Kirk Road trailhead, callers can ride these out-and-back routes:</p>')
    for direction in ("south", "north"):
        parts.append(f'<h3>Head {direction.title()}</h3>')
        parts.append('<table><tr><th>Destination</th><th>Distance</th><th>Duration</th>'
                     '<th>Highlights</th><th>Dining</th></tr>')
        for j in data["journeys"][direction]:
            parts.append(f'<tr><td><strong>{esc(j["name"])}</strong><br>'
                         f'<span class="small">{esc(j["where"])}</span></td>'
                         f'<td>{esc(j["distance"])}</td>'
                         f'<td>{esc(j["duration"])}</td>'
                         f'<td>{esc(j["highlights"])}</td>'
                         f'<td>{esc(j["dining"])}</td></tr>')
        parts.append('</table>')

    # ── 11. FAQS ─────────────────────────────────────────────────────
    parts.append('<div class="page-break"></div><h2>13. Frequently Asked Questions</h2>')
    parts.append('<p class="small">Organized by topic. Each is a verbatim answer the agent can use.</p>')
    current_section = None
    for section, q, a in data["faqs"]:
        if section != current_section:
            parts.append(f'<h3>{esc(section)}</h3>')
            current_section = section
        parts.append(f'<div class="qa"><div class="q">Q. {esc(q)}</div>'
                     f'<div class="a">A. {esc(a)}</div></div>')

    # ── 12. BOOKING TROUBLESHOOTING ──────────────────────────────────
    parts.append('<h2>14. Booking Troubleshooting</h2>')
    parts.append('<p class="small">When a caller is stuck on the online booking flow, these are the '
                 'common issues and the verbatim fixes.</p>')
    for issue, fix in data["booking_troubleshooting"]:
        parts.append(f'<div class="qa"><div class="q">{esc(issue)}</div>'
                     f'<div class="a">{esc(fix)}</div></div>')

    # ── 13. ACCESSORIES ──────────────────────────────────────────────
    parts.append('<h2>15. Recommended Accessories</h2>')
    parts.append('<p class="small">These are the Amazon affiliate picks we point customers toward. '
                 'If a caller asks "what saddle do you recommend" the agent can name these.</p>')
    parts.append('<table><tr><th>Product</th><th>Category</th><th>Why</th></tr>')
    for name, cat, why in data["accessories"]:
        parts.append(f'<tr><td><strong>{esc(name)}</strong></td>'
                     f'<td>{esc(cat)}</td><td>{esc(why)}</td></tr>')
    parts.append('</table>')

    parts.append('<p style="margin-top:24pt;font-size:9pt;color:#888;text-align:center;">'
                 f'Generated {esc(today)} from the live CMS sheet. '
                 'Re-run <code>python3 tools/gen_knowledge_base.py</code> after Sheet edits.</p>')

    parts.append('</body></html>')
    return ''.join(parts)


def main() -> int:
    if os.environ.get("FETCH_LIVE") == "1":
        live = fetch_live()
        # Live fetch returns CMS payload — we'd merge it into SNAPSHOT here
        # if Pat ever wires this up. For now the snapshot wins.
        if live:
            print("[ok] fetched live (not used in v1 — snapshot is the source of truth)", file=sys.stderr)

    out_html_str = build_html(SNAPSHOT)
    project_root = Path(__file__).resolve().parent.parent
    pdf_path  = project_root / "goodcall-knowledge-base.pdf"
    # HTML mirror for AI agents that ingest via Website URL instead of
    # PDF upload (Goodcall's PDF parser is flaky; URL ingestion is more
    # reliable + auto-refreshes whenever this file is redeployed).
    html_path = project_root / "goodcall-knowledge.html"

    # Inject a <meta name="robots" content="noindex,nofollow"> tag into
    # the HTML mirror so the page stays off Google (it's an internal
    # agent-training doc, not customer-facing). Goodcall's crawler
    # honors noindex on a per-page basis — it'll still ingest the URL
    # because Pat pasted it manually into the dashboard.
    html_with_robots = out_html_str.replace(
        '<meta charset="utf-8">',
        '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">',
        1,
    )
    html_path.write_text(html_with_robots, encoding="utf-8")
    print(f"[ok] wrote {html_path.name} ({html_path.stat().st_size // 1024} KB)")

    try:
        import weasyprint
    except ImportError:
        print(f"[warn] weasyprint not installed — skipping PDF (HTML mirror written)", file=sys.stderr)
        return 0

    weasyprint.HTML(string=out_html_str).write_pdf(str(pdf_path))
    print(f"[ok] wrote {pdf_path.name} ({pdf_path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
