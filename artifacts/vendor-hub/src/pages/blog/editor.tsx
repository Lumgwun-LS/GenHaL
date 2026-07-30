import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered,
  Quote, Link as LinkIcon, Image as ImageIcon, Undo, Redo,
  ArrowLeft, Save, Globe, Upload, Loader2, X, BookOpen,
  AlertTriangle,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await authFetch(`${BASE_URL}/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

type BlogPost = {
  id: number; title: string; slug: string; coverImageUrl: string | null;
  bodyHtml: string; excerpt: string | null; keywords: string[];
  status: "draft" | "published"; publishedAt: string | null;
};

// ── TipTap toolbar button ─────────────────────────────────────────────────────
function ToolbarBtn({
  onClick, active, disabled, title, children,
}: { onClick: () => void; active?: boolean; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

// ── Keywords input ────────────────────────────────────────────────────────────
function KeywordsInput({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const kw = input.trim();
    if (!kw || keywords.includes(kw)) { setInput(""); return; }
    onChange([...keywords, kw]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          placeholder="Add keyword and press Enter…"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={add}>Add</Button>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className="text-xs gap-1">
              {kw}
              <button type="button" onClick={() => onChange(keywords.filter((k) => k !== kw))}>
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cover image uploader ──────────────────────────────────────────────────────
function CoverImageUploader({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
    setUploading(true);
    try {
      const { uploadUrl, mediaUrl } = await apiFetch("/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "image" }),
      });
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      onChange(mediaUrl);
      toast.success("Cover image uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border">
          <img src={value} alt="Cover" className="w-full h-44 object-cover" />
          <Button
            type="button" variant="destructive" size="sm"
            className="absolute top-2 right-2 h-7"
            onClick={() => onChange(null)}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Remove
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full h-36 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
        >
          {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
          <span className="text-sm">{uploading ? "Uploading…" : "Click to upload cover image"}</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function BlogEditor() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const isEditing = !!params.id && params.id !== "new";

  const [title, setTitle] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [originalStatus, setOriginalStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [showPublishedWarning, setShowPublishedWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save-draft" | "publish" | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your blog post here…" }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "prose prose-invert max-w-none min-h-[300px] focus:outline-none p-4 text-foreground" },
    },
  });

  // Load existing post
  useEffect(() => {
    if (!isEditing || !params.id) return;
    apiFetch(`/blog/posts/${params.id}`)
      .then(({ post }: { post: BlogPost }) => {
        setTitle(post.title);
        setCoverImageUrl(post.coverImageUrl);
        setKeywords(post.keywords ?? []);
        setOriginalStatus(post.status);
        editor?.commands.setContent(post.bodyHtml ?? "");
      })
      .catch((err) => toast.error(err.message ?? "Failed to load post"))
      .finally(() => setLoading(false));
  }, [isEditing, params.id, editor]);

  // Image upload inside editor
  const handleEditorImage = async (file: File) => {
    setImageUploading(true);
    try {
      const { uploadUrl, mediaUrl } = await apiFetch("/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "image" }),
      });
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      editor?.chain().focus().setImage({ src: mediaUrl }).run();
    } catch (err: any) {
      toast.error(err.message ?? "Image upload failed");
    } finally {
      setImageUploading(false);
    }
  };

  const addLink = () => {
    const url = window.prompt("Enter URL:");
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  };

  const getBodyHtml = () => editor?.getHTML() ?? "";

  const doSave = useCallback(async (targetStatus: "draft" | "published") => {
    if (!title.trim()) { toast.error("Please enter a title"); return; }
    setSaving(true);
    try {
      const body = { title, bodyHtml: getBodyHtml(), coverImageUrl, keywords, status: targetStatus };

      if (isEditing && params.id) {
        // Save content changes
        await apiFetch(`/blog/posts/${params.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, bodyHtml: getBodyHtml(), coverImageUrl, keywords }),
        });
        // If publishing/unpublishing, call the dedicated endpoint
        if (targetStatus === "published" && originalStatus === "draft") {
          await apiFetch(`/blog/posts/${params.id}/publish`, { method: "POST" });
          setOriginalStatus("published");
          toast.success("Post published");
        } else if (targetStatus === "draft" && originalStatus === "published") {
          await apiFetch(`/blog/posts/${params.id}/unpublish`, { method: "POST" });
          setOriginalStatus("draft");
          toast.success("Post moved to draft");
        } else {
          toast.success("Post saved");
        }
      } else {
        const { post } = await apiFetch("/blog/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success(targetStatus === "published" ? "Post published" : "Draft saved");
        setLocation(`/blog/${post.id}/edit`);
        return;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  }, [title, coverImageUrl, keywords, isEditing, params.id, originalStatus, editor, setLocation]);

  const handleSaveDraft = () => {
    if (originalStatus === "published") { setShowPublishedWarning(true); setPendingAction("save-draft"); return; }
    doSave("draft");
  };

  const handlePublish = () => {
    if (originalStatus === "published") { setShowPublishedWarning(true); setPendingAction("publish"); return; }
    doSave("published");
  };

  const confirmAction = () => {
    setShowPublishedWarning(false);
    if (pendingAction === "save-draft") doSave("draft");
    else if (pendingAction === "publish") doSave("published");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setLocation("/blog")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Blog
        </button>
        <div className="flex items-center gap-2">
          {originalStatus === "published" && (
            <Badge variant="default" className="gap-1"><Globe className="w-3 h-3" /> Live</Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving}>
            {saving && pendingAction === "save-draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save Draft
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={saving}>
            {saving && pendingAction === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Globe className="w-3.5 h-3.5 mr-1" />}
            {originalStatus === "published" ? "Update Live" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title…"
            className="text-2xl font-bold h-auto py-3 px-4 border-0 border-b rounded-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          {/* Toolbar */}
          <Card className="p-2">
            <div className="flex flex-wrap items-center gap-0.5">
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold">
                <Bold className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic">
                <Italic className="w-4 h-4" />
              </ToolbarBtn>
              <div className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="Heading 2">
                <Heading2 className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} title="Heading 3">
                <Heading3 className="w-4 h-4" />
              </ToolbarBtn>
              <div className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet list">
                <List className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Numbered list">
                <ListOrdered className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive("blockquote")} title="Quote">
                <Quote className="w-4 h-4" />
              </ToolbarBtn>
              <div className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn onClick={addLink} active={editor?.isActive("link")} title="Add link">
                <LinkIcon className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => imageFileRef.current?.click()} disabled={imageUploading} title="Insert image">
                {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </ToolbarBtn>
              <div className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo">
                <Undo className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo">
                <Redo className="w-4 h-4" />
              </ToolbarBtn>
            </div>
          </Card>

          {/* Editor */}
          <Card className="min-h-[400px] overflow-hidden">
            <EditorContent editor={editor} className="min-h-[400px]" />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Cover Image
            </Label>
            <CoverImageUploader value={coverImageUrl} onChange={setCoverImageUrl} />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Keywords / Tags
            </Label>
            <KeywordsInput keywords={keywords} onChange={setKeywords} />
          </div>

          <div className="pt-2 border-t space-y-2">
            <Button className="w-full" onClick={handlePublish} disabled={saving}>
              <Globe className="w-4 h-4 mr-2" />
              {originalStatus === "published" ? "Update Live Post" : "Publish Now"}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSaveDraft} disabled={saving}>
              <Save className="w-4 h-4 mr-2" /> Save as Draft
            </Button>
          </div>
        </div>
      </div>

      {/* Published post warning */}
      <AlertDialog open={showPublishedWarning} onOpenChange={(o) => !o && setShowPublishedWarning(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Update live post?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This post is already published and visible to your readers. Saving will update the live page immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for editor images */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEditorImage(f); }}
      />
    </div>
  );
}
