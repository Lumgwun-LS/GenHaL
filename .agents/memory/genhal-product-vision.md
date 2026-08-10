---
name: GenHaL Product Vision & Strategic Moat
description: The canonical mission, market position, and long-term competitive moat for GenHaL
---

## The Mission (verbatim from the founder)

> A SaaS platform where every community can build its own digital heritage archive and genealogy network, preserve its history and language, document its people and culture, and connect its families and descendants across generations, states and countries.

## The Moat

The **global relationship graph** is the long-term competitive moat.

A genealogy/heritage network containing:
- Thousands of verified communities
- Millions of people
- Historical evidence
- Oral histories
- Relationships
- Migration paths
- Cultural records

…becomes **progressively more valuable as more communities join**. This is a classic network-effect flywheel — each new community adds value for all existing ones by expanding the graph, filling migration gaps, and connecting distant families.

## Strategic Implications for Every Build Decision

1. **Community tenancy is the foundational primitive.** Every record (person, tree, heritage post, language entry, recording) must be scoped to a tenant (community or family), not a raw Clerk user ID. Task #789 is prerequisite to everything else.

2. **The person registry is the graph substrate.** `genhal_persons` with cross-community identity resolution (Task #790) is what turns isolated community archives into a connected network. Without it, GenHaL is just a collection of silos.

3. **Data contributions compound.** Heritage recordings, language entries, oral histories, and genealogy links are not consumed — they accumulate. Every new contributor makes the platform more valuable for everyone, not just themselves. Design flows to maximize contribution velocity.

4. **Verified community membership matters.** A relationship claim between two people is only as valuable as the evidence backing it. Build evidence-linking into the data model from the start.

5. **Migration paths are a unique differentiator.** The African diaspora spread across continents. A platform that can trace "your family left Obolo, moved to Lagos in 1942, emigrated to London in 1971" is genuinely irreplaceable — no Western genealogy platform has this data.

6. **The SaaS landing page (Task #791) must tell the network-effect story.** The CTA is "register your community" — not "sign up as an individual." Communities are the growth unit.

## Three Subscriber Tiers (already established)

- **GenHaL Community** — towns, ethnic groups, diaspora associations
- **GenHaL Family** — private family trees
- **GenHaL Heritage** — museums, universities, research institutions

## Eight Product Pillars (already established)

Communities · Genealogy · Heritage · Archive · Languages · AI · Studio · Language Lab

## The AI Play

GenHaL AI is a RAG system that answers questions from a **community's own verified archive** — not generic internet data. A community's elders, stories, and records become a queryable knowledge base that only that community controls.

Long-term pipeline: Research → Script → Dialogue → Voices → Music → Video → Subtitles
(Spring Boot → AI Gateway → Python AI services: LLM, ASR, TTS, Embeddings, Image/Video gen)

**Why:** No AI company has African language training data at community depth. GenHaL's Heritage Collector creates it as a byproduct of platform use.
