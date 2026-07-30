/**
 * Public blog post detail page — /public-blog/:siteSlug/:postSlug
 * No authentication required.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Calendar, Eye, Heart, MessageSquare,
  BookOpen, Loader2, Send, CheckCircle2, AlertCircle,
  User, Mail, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PostDetail = {
  id: number; title: string; slug: string;
  coverImageUrl: string | null; bodyHtml: string; excerpt: string | null;
  keywords: string[]; viewCount: number; likeCount: number; commentCount: number;
  publishedAt: string | null;
};

type Comment = {
  id: number; commenterName: string; commenterEmail: string; body: string; createdAt: string;
};

type VendorInfo = { name: string; logoUrl: string | null; description: string | null };

// Simple HTML sanitiser — strips scripts/iframes; keeps formatting tags
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export default function PublicBlogPost() {
  const { siteSlug, postSlug } = useParams<{ siteSlug: string; postSlug: string }>();
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [hasLiked, setHasLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comment form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);

  const commentFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteSlug || !postSlug) return;
    setLoading(true);
    fetch(`${BASE_URL}/api/public/blog/${encodeURIComponent(siteSlug)}/${encodeURIComponent(postSlug)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Post not found");
        return r.json();
      })
      .then((data) => {
        setVendor(data.vendor);
        setPost(data.post);
        setComments(data.comments ?? []);
        setHasLiked(data.hasLiked ?? false);
        setLikeCount(data.post.likeCount ?? 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteSlug, postSlug]);

  const handleLike = async () => {
    if (!siteSlug || !postSlug || liking) return;
    setLiking(true);
    try {
      const res = await fetch(
        `${BASE_URL}/api/public/blog/${encodeURIComponent(siteSlug)}/${encodeURIComponent(postSlug)}/like`,
        { method: "POST", credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setHasLiked(data.liked);
        setLikeCount(data.likeCount);
      }
    } catch {/* best-effort */} finally {
      setLiking(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/api/public/blog/${encodeURIComponent(siteSlug!)}/${encodeURIComponent(postSlug!)}/comments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, body }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to submit comment");
        return;
      }
      setComments((prev) => [data.comment, ...prev]);
      setSubmitSuccess(true);
      setName(""); setEmail(""); setPhone(""); setBody("");
      if (post) setPost({ ...post, commentCount: post.commentCount + 1 });
    } catch (err: any) {
      setSubmitError(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !post || !vendor) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="w-16 h-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold">Post not found</h1>
        <p className="text-muted-foreground">This post doesn't exist or may have been removed.</p>
        <Link href={`/public-blog/${siteSlug}`}>
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Blog</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/public-blog/${siteSlug}`}>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              {vendor.name}&rsquo;s Blog
            </button>
          </Link>
          {vendor.logoUrl && (
            <img src={vendor.logoUrl} alt={vendor.name} className="w-7 h-7 rounded-full object-cover ml-auto" />
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Cover image */}
        {post.coverImageUrl && (
          <img
            src={post.coverImageUrl}
            alt={post.title}
            className="w-full h-64 md:h-80 object-cover rounded-xl shadow-md"
          />
        )}

        {/* Post meta */}
        <div className="space-y-4">
          {/* Keywords */}
          {post.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          )}
          {/* Title */}
          <h1 className="text-3xl font-extrabold leading-tight">{post.title}</h1>
          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {post.publishedAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </span>
            )}
            <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" />{post.viewCount} views</span>
            <span className="flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />{comments.length} comments</span>
          </div>
        </div>

        {/* Body */}
        <div
          className="tiptap prose prose-invert prose-sm sm:prose-base max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.bodyHtml) }}
        />

        {/* Like button */}
        <div className="flex items-center gap-3 py-4 border-t border-b">
          <button
            onClick={handleLike}
            disabled={liking}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium",
              hasLiked
                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {liking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Heart className={cn("w-4 h-4 transition-all", hasLiked && "fill-red-500 text-red-500")} />
            }
            {likeCount} {likeCount === 1 ? "like" : "likes"}
          </button>
          <button
            onClick={() => commentFormRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            {comments.length === 0 ? "Be the first to comment" : `${comments.length} comment${comments.length > 1 ? "s" : ""}`}
          </button>
        </div>

        {/* Comments section */}
        <div className="space-y-6" ref={commentFormRef}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Comments {comments.length > 0 && <span className="text-muted-foreground font-normal text-base">({comments.length})</span>}
          </h2>

          {/* Comment list */}
          {comments.length > 0 && (
            <div className="space-y-4">
              {comments.map((c) => (
                <Card key={c.id} className="border-muted/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{c.commenterName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString("en-US", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed pl-10">{c.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Comment form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Leave a comment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your contact info helps {vendor.name} reach out to you. It won't be published.
              </p>
            </CardHeader>
            <CardContent>
              {submitSuccess ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                  <h3 className="font-semibold">Thank you for your comment!</h3>
                  <p className="text-sm text-muted-foreground">Your comment has been posted.</p>
                  <Button variant="outline" size="sm" onClick={() => setSubmitSuccess(false)}>
                    Leave another comment
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleComment} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-name" className="text-sm">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          id="c-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          className="pl-9"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-email" className="text-sm">
                        Email Address <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          id="c-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="pl-9"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone" className="text-sm">
                      Phone Number <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        id="c-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 234 567 8900"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-body" className="text-sm">
                      Your Comment <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="c-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Share your thoughts…"
                      rows={4}
                      required
                    />
                  </div>
                  {submitError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {submitError}
                    </div>
                  )}
                  <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting…</>
                      : <><Send className="w-4 h-4 mr-2" /> Post Comment</>
                    }
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
