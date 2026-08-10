import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  genhalTreesTable,
  genhalTreeMembersTable,
  genhalCommunitiesTable,
  genhalHeritagePostsTable,
  genhalLanguagesTable,
  genhalLanguageEntriesTable,
  genhalAiGenerationsTable,
} from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

import {
  CreateGenhalTreeBody,
  UpdateGenhalTreeBody,
  AddGenhalTreeMemberBody,
  UpdateGenhalTreeMemberBody,
  CreateGenhalCommunityBody,
  UpdateGenhalCommunityBody,
  CreateGenhalHeritagePostBody,
  CreateGenhalLanguageEntryBody,
  UpdateGenhalLanguageEntryBody,
  GenerateGenhalStoryBody,
  TranslateGenhalBody,
  CaptionGenhalImageBody,
} from "@workspace/api-zod";

const router = Router();

// ── Dashboard ────────────────────────────────────────────────────────────────

router.get("/genhal/dashboard", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);

    const [[treeRow], [memberRow], [communityRow], [heritageRow], [langRow], [entryRow], [aiRow]] =
      await Promise.all([
        db.select({ c: count() }).from(genhalTreesTable).where(eq(genhalTreesTable.clerkUserId, userId!)),
        db.select({ c: count() }).from(genhalTreeMembersTable),
        db.select({ c: count() }).from(genhalCommunitiesTable),
        db.select({ c: count() }).from(genhalHeritagePostsTable),
        db.select({ c: count() }).from(genhalLanguagesTable),
        db.select({ c: count() }).from(genhalLanguageEntriesTable),
        db.select({ c: count() }).from(genhalAiGenerationsTable).where(eq(genhalAiGenerationsTable.clerkUserId, userId!)),
      ]);

    // Recent activity — last 8 items across trees + posts + entries
    const [recentTrees, recentPosts, recentEntries] = await Promise.all([
      db.select({ type: sql<string>`'tree'`, description: genhalTreesTable.name, createdAt: genhalTreesTable.createdAt })
        .from(genhalTreesTable).where(eq(genhalTreesTable.clerkUserId, userId!)).orderBy(desc(genhalTreesTable.createdAt)).limit(3),
      db.select({ type: sql<string>`'heritage'`, description: genhalHeritagePostsTable.title, createdAt: genhalHeritagePostsTable.createdAt })
        .from(genhalHeritagePostsTable).where(eq(genhalHeritagePostsTable.clerkUserId, userId!)).orderBy(desc(genhalHeritagePostsTable.createdAt)).limit(3),
      db.select({ type: sql<string>`'language'`, description: sql<string>`word || ' (' || language_code || ')'`, createdAt: genhalLanguageEntriesTable.createdAt })
        .from(genhalLanguageEntriesTable).where(eq(genhalLanguageEntriesTable.clerkUserId, userId!)).orderBy(desc(genhalLanguageEntriesTable.createdAt)).limit(3),
    ]);

    const recentActivity = [...recentTrees, ...recentPosts, ...recentEntries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));

    res.json({
      totalTrees: Number(treeRow?.c ?? 0),
      totalMembers: Number(memberRow?.c ?? 0),
      totalCommunities: Number(communityRow?.c ?? 0),
      totalHeritagePosts: Number(heritageRow?.c ?? 0),
      totalLanguages: Number(langRow?.c ?? 0),
      totalEntries: Number(entryRow?.c ?? 0),
      totalAiGenerations: Number(aiRow?.c ?? 0),
      recentActivity,
    });
  } catch (err) {
    logger.error(err, "getGenhalDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Trees ────────────────────────────────────────────────────────────────────

router.get("/genhal/trees", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const rows = await db
      .select({
        id: genhalTreesTable.id,
        name: genhalTreesTable.name,
        description: genhalTreesTable.description,
        originCountry: genhalTreesTable.originCountry,
        originEthnicGroup: genhalTreesTable.originEthnicGroup,
        coverImageUrl: genhalTreesTable.coverImageUrl,
        clerkUserId: genhalTreesTable.clerkUserId,
        createdAt: genhalTreesTable.createdAt,
        memberCount: count(genhalTreeMembersTable.id),
      })
      .from(genhalTreesTable)
      .leftJoin(genhalTreeMembersTable, eq(genhalTreeMembersTable.treeId, genhalTreesTable.id))
      .where(eq(genhalTreesTable.clerkUserId, userId!))
      .groupBy(genhalTreesTable.id)
      .orderBy(desc(genhalTreesTable.createdAt));

    res.json(rows.map(r => ({ ...r, memberCount: Number(r.memberCount), createdAt: new Date(r.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalTrees error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/genhal/trees", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = CreateGenhalTreeBody.parse(req.body);
    const [tree] = await db.insert(genhalTreesTable).values({ ...body, clerkUserId: userId! }).returning();
    res.status(201).json({ ...tree, memberCount: 0, createdAt: new Date(tree.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "createGenhalTree error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/genhal/trees/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    const [tree] = await db.select().from(genhalTreesTable).where(and(eq(genhalTreesTable.id, id), eq(genhalTreesTable.clerkUserId, userId!)));
    if (!tree) return res.status(404).json({ error: "Tree not found" });

    const members = await db.select().from(genhalTreeMembersTable).where(eq(genhalTreeMembersTable.treeId, id)).orderBy(genhalTreeMembersTable.id);

    res.json({
      ...tree,
      memberCount: members.length,
      members: members.map(m => ({ ...m, createdAt: new Date(m.createdAt).toISOString() })),
      createdAt: new Date(tree.createdAt).toISOString(),
    });
  } catch (err) {
    logger.error(err, "getGenhalTree error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/genhal/trees/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    const body = UpdateGenhalTreeBody.parse(req.body);
    const [tree] = await db.update(genhalTreesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(genhalTreesTable.id, id), eq(genhalTreesTable.clerkUserId, userId!)))
      .returning();
    if (!tree) return res.status(404).json({ error: "Tree not found" });
    res.json({ ...tree, memberCount: 0, createdAt: new Date(tree.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "updateGenhalTree error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/genhal/trees/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    await db.delete(genhalTreesTable).where(and(eq(genhalTreesTable.id, id), eq(genhalTreesTable.clerkUserId, userId!)));
    res.status(204).send();
  } catch (err) {
    logger.error(err, "deleteGenhalTree error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Tree Members ─────────────────────────────────────────────────────────────

router.get("/genhal/trees/:id/members", requireAuth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const members = await db.select().from(genhalTreeMembersTable).where(eq(genhalTreeMembersTable.treeId, id)).orderBy(genhalTreeMembersTable.id);
    res.json(members.map(m => ({ ...m, createdAt: new Date(m.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalTreeMembers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/genhal/trees/:id/members", requireAuth(), async (req, res) => {
  try {
    const treeId = Number(req.params.id);
    const body = AddGenhalTreeMemberBody.parse(req.body);
    const [member] = await db.insert(genhalTreeMembersTable).values({ ...body, treeId }).returning();
    res.status(201).json({ ...member, createdAt: new Date(member.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "addGenhalTreeMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/genhal/trees/:id/members/:memberId", requireAuth(), async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const body = UpdateGenhalTreeMemberBody.parse(req.body);
    const [member] = await db.update(genhalTreeMembersTable).set(body).where(eq(genhalTreeMembersTable.id, memberId)).returning();
    if (!member) return res.status(404).json({ error: "Member not found" });
    res.json({ ...member, createdAt: new Date(member.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "updateGenhalTreeMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/genhal/trees/:id/members/:memberId", requireAuth(), async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    await db.delete(genhalTreeMembersTable).where(eq(genhalTreeMembersTable.id, memberId));
    res.status(204).send();
  } catch (err) {
    logger.error(err, "deleteGenhalTreeMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Heritage ─────────────────────────────────────────────────────────────────

router.get("/genhal/heritage/feed", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const posts = await db
      .select({
        id: genhalHeritagePostsTable.id,
        communityId: genhalHeritagePostsTable.communityId,
        communityName: genhalCommunitiesTable.name,
        title: genhalHeritagePostsTable.title,
        body: genhalHeritagePostsTable.body,
        type: genhalHeritagePostsTable.type,
        mediaUrl: genhalHeritagePostsTable.mediaUrl,
        audioUrl: genhalHeritagePostsTable.audioUrl,
        tags: genhalHeritagePostsTable.tags,
        clerkUserId: genhalHeritagePostsTable.clerkUserId,
        authorName: genhalHeritagePostsTable.authorName,
        createdAt: genhalHeritagePostsTable.createdAt,
      })
      .from(genhalHeritagePostsTable)
      .leftJoin(genhalCommunitiesTable, eq(genhalCommunitiesTable.id, genhalHeritagePostsTable.communityId))
      .orderBy(desc(genhalHeritagePostsTable.createdAt))
      .limit(limit);
    res.json(posts.map(p => ({ ...p, createdAt: new Date(p.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalHeritageFeed error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/genhal/communities", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: genhalCommunitiesTable.id,
        name: genhalCommunitiesTable.name,
        country: genhalCommunitiesTable.country,
        ethnicGroup: genhalCommunitiesTable.ethnicGroup,
        description: genhalCommunitiesTable.description,
        coverImageUrl: genhalCommunitiesTable.coverImageUrl,
        clerkUserId: genhalCommunitiesTable.clerkUserId,
        createdAt: genhalCommunitiesTable.createdAt,
        postCount: count(genhalHeritagePostsTable.id),
        memberCount: sql<number>`0`,
      })
      .from(genhalCommunitiesTable)
      .leftJoin(genhalHeritagePostsTable, eq(genhalHeritagePostsTable.communityId, genhalCommunitiesTable.id))
      .groupBy(genhalCommunitiesTable.id)
      .orderBy(desc(genhalCommunitiesTable.createdAt));
    res.json(rows.map(r => ({ ...r, postCount: Number(r.postCount), memberCount: Number(r.memberCount), createdAt: new Date(r.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalCommunities error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/genhal/communities", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = CreateGenhalCommunityBody.parse(req.body);
    const [community] = await db.insert(genhalCommunitiesTable).values({ ...body, clerkUserId: userId! }).returning();
    res.status(201).json({ ...community, postCount: 0, memberCount: 0, createdAt: new Date(community.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "createGenhalCommunity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/genhal/communities/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [community] = await db
      .select({
        id: genhalCommunitiesTable.id,
        name: genhalCommunitiesTable.name,
        country: genhalCommunitiesTable.country,
        ethnicGroup: genhalCommunitiesTable.ethnicGroup,
        description: genhalCommunitiesTable.description,
        coverImageUrl: genhalCommunitiesTable.coverImageUrl,
        clerkUserId: genhalCommunitiesTable.clerkUserId,
        createdAt: genhalCommunitiesTable.createdAt,
        postCount: count(genhalHeritagePostsTable.id),
        memberCount: sql<number>`0`,
      })
      .from(genhalCommunitiesTable)
      .leftJoin(genhalHeritagePostsTable, eq(genhalHeritagePostsTable.communityId, genhalCommunitiesTable.id))
      .where(eq(genhalCommunitiesTable.id, id))
      .groupBy(genhalCommunitiesTable.id);
    if (!community) return res.status(404).json({ error: "Community not found" });
    res.json({ ...community, postCount: Number(community.postCount), memberCount: Number(community.memberCount), createdAt: new Date(community.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "getGenhalCommunity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/genhal/communities/:id", requireAuth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateGenhalCommunityBody.parse(req.body);
    const [community] = await db.update(genhalCommunitiesTable).set({ ...body, updatedAt: new Date() }).where(eq(genhalCommunitiesTable.id, id)).returning();
    if (!community) return res.status(404).json({ error: "Community not found" });
    res.json({ ...community, postCount: 0, memberCount: 0, createdAt: new Date(community.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "updateGenhalCommunity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/genhal/communities/:id/posts", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const posts = await db
      .select({
        id: genhalHeritagePostsTable.id,
        communityId: genhalHeritagePostsTable.communityId,
        communityName: genhalCommunitiesTable.name,
        title: genhalHeritagePostsTable.title,
        body: genhalHeritagePostsTable.body,
        type: genhalHeritagePostsTable.type,
        mediaUrl: genhalHeritagePostsTable.mediaUrl,
        audioUrl: genhalHeritagePostsTable.audioUrl,
        tags: genhalHeritagePostsTable.tags,
        clerkUserId: genhalHeritagePostsTable.clerkUserId,
        authorName: genhalHeritagePostsTable.authorName,
        createdAt: genhalHeritagePostsTable.createdAt,
      })
      .from(genhalHeritagePostsTable)
      .leftJoin(genhalCommunitiesTable, eq(genhalCommunitiesTable.id, genhalHeritagePostsTable.communityId))
      .where(eq(genhalHeritagePostsTable.communityId, id))
      .orderBy(desc(genhalHeritagePostsTable.createdAt));
    res.json(posts.map(p => ({ ...p, createdAt: new Date(p.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalCommunityPosts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/genhal/communities/:id/posts", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const communityId = Number(req.params.id);
    const body = CreateGenhalHeritagePostBody.parse(req.body);
    const [post] = await db.insert(genhalHeritagePostsTable).values({ ...body, communityId, clerkUserId: userId! }).returning();
    const [community] = await db.select({ name: genhalCommunitiesTable.name }).from(genhalCommunitiesTable).where(eq(genhalCommunitiesTable.id, communityId));
    res.status(201).json({ ...post, communityName: community?.name ?? null, createdAt: new Date(post.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "createGenhalHeritagePost error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Languages ────────────────────────────────────────────────────────────────

router.get("/genhal/languages", async (_req, res) => {
  try {
    const languages = await db.select().from(genhalLanguagesTable).orderBy(genhalLanguagesTable.name);
    const entryCounts = await db
      .select({ code: genhalLanguageEntriesTable.languageCode, c: count() })
      .from(genhalLanguageEntriesTable)
      .groupBy(genhalLanguageEntriesTable.languageCode);
    const countMap = Object.fromEntries(entryCounts.map(e => [e.code, Number(e.c)]));
    res.json(languages.map(l => ({ ...l, entryCount: countMap[l.code] ?? 0 })));
  } catch (err) {
    logger.error(err, "listGenhalLanguages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/genhal/languages/:code/entries", async (req, res) => {
  try {
    const { code } = req.params;
    const entries = await db.select().from(genhalLanguageEntriesTable)
      .where(eq(genhalLanguageEntriesTable.languageCode, code))
      .orderBy(genhalLanguageEntriesTable.word);
    res.json(entries.map(e => ({ ...e, createdAt: new Date(e.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalLanguageEntries error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/genhal/languages/:code/entries", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { code } = req.params;
    const body = CreateGenhalLanguageEntryBody.parse(req.body);
    const [entry] = await db.insert(genhalLanguageEntriesTable).values({ ...body, languageCode: code, clerkUserId: userId! }).returning();
    res.status(201).json({ ...entry, createdAt: new Date(entry.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "createGenhalLanguageEntry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/genhal/languages/:code/entries/:entryId", requireAuth(), async (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    const body = UpdateGenhalLanguageEntryBody.parse(req.body);
    const [entry] = await db.update(genhalLanguageEntriesTable).set(body).where(eq(genhalLanguageEntriesTable.id, entryId)).returning();
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    res.json({ ...entry, createdAt: new Date(entry.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "updateGenhalLanguageEntry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/genhal/languages/:code/entries/:entryId", requireAuth(), async (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    await db.delete(genhalLanguageEntriesTable).where(eq(genhalLanguageEntriesTable.id, entryId));
    res.status(204).send();
  } catch (err) {
    logger.error(err, "deleteGenhalLanguageEntry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── AI ───────────────────────────────────────────────────────────────────────

router.post("/genhal/ai/generate-story", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = GenerateGenhalStoryBody.parse(req.body);

    let contextData = "";
    if (body.treeId) {
      const members = await db.select().from(genhalTreeMembersTable).where(eq(genhalTreeMembersTable.treeId, body.treeId)).limit(20);
      contextData = `Family members: ${members.map(m => `${m.firstName} ${m.lastName ?? ""} (${m.gender}, born ${m.birthDate ?? "unknown"}, ${m.birthPlace ?? ""})`).join("; ")}`;
    }
    if (body.communityId) {
      const [community] = await db.select().from(genhalCommunitiesTable).where(eq(genhalCommunitiesTable.id, body.communityId));
      if (community) contextData += ` Community: ${community.name} (${community.ethnicGroup}, ${community.country}). ${community.description ?? ""}`;
    }

    const prompt = body.customPrompt
      ? body.customPrompt
      : `Write a compelling ${body.storyType} narrative ${contextData ? `based on this data: ${contextData}` : "about African heritage and family history"}. Use vivid, respectful storytelling that honors African oral traditions. Write in ${body.language ?? "English"}.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are GenHaL AI, a storytelling assistant specializing in African genealogy, heritage, and cultural narratives. Your stories are vivid, culturally sensitive, and celebrate African heritage." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
    });

    const result = completion.choices[0]?.message?.content ?? "";
    const [generation] = await db.insert(genhalAiGenerationsTable).values({
      type: "story",
      prompt,
      result,
      metadata: { storyType: body.storyType, treeId: body.treeId, communityId: body.communityId },
      clerkUserId: userId!,
    }).returning();

    res.json({ ...generation, createdAt: new Date(generation.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "generateGenhalStory error");
    res.status(500).json({ error: "Story generation failed" });
  }
});

router.post("/genhal/ai/translate", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = TranslateGenhalBody.parse(req.body);

    const prompt = `Translate the following text ${body.sourceLanguage ? `from ${body.sourceLanguage}` : ""} to ${body.targetLanguage}. ${body.context ? `Context: ${body.context}.` : ""} Provide the translation and a brief note about any cultural nuances.\n\nText: "${body.text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are GenHaL AI, a linguistic expert in African languages including Obolo, Ijaw, Yoruba, Igbo, Hausa, Swahili, Zulu, Amharic, and many others. Provide accurate translations with cultural context." },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
    });

    const result = completion.choices[0]?.message?.content ?? "";
    const [generation] = await db.insert(genhalAiGenerationsTable).values({
      type: "translation",
      prompt: body.text,
      result,
      metadata: { sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage },
      clerkUserId: userId!,
    }).returning();

    res.json({ ...generation, createdAt: new Date(generation.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "translateGenhal error");
    res.status(500).json({ error: "Translation failed" });
  }
});

router.post("/genhal/ai/caption-image", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = CaptionGenhalImageBody.parse(req.body);

    let contextStr = body.context ?? "";
    if (body.communityId) {
      const [community] = await db.select().from(genhalCommunitiesTable).where(eq(genhalCommunitiesTable.id, body.communityId));
      if (community) contextStr += ` Community: ${community.name} (${community.ethnicGroup}, ${community.country})`;
    }

    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are GenHaL AI, a heritage documentation expert. Generate respectful, culturally aware captions for African heritage photographs that capture historical and cultural significance." },
        { role: "user", content: `Generate a culturally rich caption for this heritage image. ${contextStr ? `Context: ${contextStr}.` : ""} Image URL: ${body.imageUrl}. Write the caption in ${body.language ?? "English"}. Be descriptive and historically mindful.` },
      ],
      max_tokens: 300,
    });

    const caption = result.choices[0]?.message?.content ?? "";
    const [generation] = await db.insert(genhalAiGenerationsTable).values({
      type: "caption",
      prompt: body.imageUrl,
      result: caption,
      metadata: { imageUrl: body.imageUrl, communityId: body.communityId },
      clerkUserId: userId!,
    }).returning();

    res.json({ ...generation, createdAt: new Date(generation.createdAt).toISOString() });
  } catch (err) {
    logger.error(err, "captionGenhalImage error");
    res.status(500).json({ error: "Caption generation failed" });
  }
});

router.get("/genhal/ai/generations", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const generations = await db.select().from(genhalAiGenerationsTable)
      .where(eq(genhalAiGenerationsTable.clerkUserId, userId!))
      .orderBy(desc(genhalAiGenerationsTable.createdAt))
      .limit(50);
    res.json(generations.map(g => ({ ...g, createdAt: new Date(g.createdAt).toISOString() })));
  } catch (err) {
    logger.error(err, "listGenhalAiGenerations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
