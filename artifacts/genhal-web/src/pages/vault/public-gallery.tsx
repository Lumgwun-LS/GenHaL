/**
 * Public Vault Gallery — shows only documents marked accessLevel="public".
 * Private/encrypted documents are never exposed here.
 * Beautiful animated grid with Framer Motion staggered entry.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Image as ImageIcon, Video, Music, Archive,
  Eye, Download, ExternalLink, X, Loader2, Lock, Globe,
  FolderOpen, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getApiBaseUrl } from "@/lib/api";

export interface PublicGalleryProps {
  unitType: "kingdom" | "family" | "compound";
  unitId: number;
  unitName?: string;
}

interface PublicDoc {
  id: number;
  title: string;
  description?: string;
  fileType: string;
  mimeType?: string;
  category?: string;
  tags?: string[];
  fileUrl?: string;
  fileName?: string;
  viewCount: number;
  createdAt: string;
}

const FILE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; gradient: string }> = {
  image:    { icon: <ImageIcon className="h-6 w-6" />, color: "text-violet-600 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-500/15", gradient: "from-violet-500 to-purple-600" },
  video:    { icon: <Video className="h-6 w-6" />,     color: "text-blue-600 dark:text-blue-300",   bg: "bg-blue-100 dark:bg-blue-500/15",   gradient: "from-blue-500 to-cyan-600" },
  audio:    { icon: <Music className="h-6 w-6" />,     color: "text-pink-600 dark:text-pink-300",   bg: "bg-pink-100 dark:bg-pink-500/15",   gradient: "from-pink-500 to-rose-600" },
  document: { icon: <FileText className="h-6 w-6" />,  color: "text-amber-600 dark:text-amber-300",  bg: "bg-amber-100 dark:bg-amber-500/15",  gradient: "from-amber-500 to-orange-600" },
  other:    { icon: <Archive className="h-6 w-6" />,   color: "text-slate-600 dark:text-muted-foreground",  bg: "bg-slate-100 dark:bg-white/10",  gradient: "from-slate-500 to-gray-600" },
};

const FILTER_OPTIONS = [
  { value: "all",      label: "All" },
  { value: "image",    label: "Photos" },
  { value: "video",    label: "Videos" },
  { value: "document", label: "Documents" },
  { value: "audio",    label: "Audio" },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { type: "spring" as const, damping: 18, stiffness: 200 } },
};

function FileCard({ doc, onClick }: { doc: PublicDoc; onClick: () => void }) {
  const cfg = FILE_TYPE_CONFIG[doc.fileType] ?? FILE_TYPE_CONFIG.other;
  const isImage = doc.fileType === "image";
  const isVideo = doc.fileType === "video";

  return (
    <motion.div variants={cardVariants} layout>
      <motion.div
        whileHover={{ y: -4, boxShadow: "0 20px 40px -8px rgba(0,0,0,0.15)" }}
        transition={{ type: "spring", damping: 20 }}
        className="group relative bg-card border rounded-2xl overflow-hidden cursor-pointer"
        onClick={onClick}
      >
        {/* Visual header */}
        <div className={`relative h-40 bg-gradient-to-br ${cfg.gradient} flex items-center justify-center overflow-hidden`}>
          {isImage && doc.fileUrl ? (
            <img src={doc.fileUrl} alt={doc.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : isVideo && doc.fileUrl ? (
            <>
              <div className="absolute inset-0 bg-black/30" />
              <PlayCircle className="h-12 w-12 text-white drop-shadow-lg z-10" />
            </>
          ) : (
            <div className="text-white/90 drop-shadow-md">
              {cfg.icon}
            </div>
          )}

          {/* Overlay on hover */}
          <motion.div
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2"
          >
            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm text-white">
              <Eye className="h-5 w-5" />
            </div>
            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-2 rounded-xl bg-white/20 backdrop-blur-sm text-white">
                <Download className="h-5 w-5" />
              </a>
            )}
          </motion.div>

          {/* Category badge */}
          {doc.category && (
            <div className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/30 text-white backdrop-blur-sm">
              {doc.category.replace(/_/g, " ")}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3.5">
          <p className="font-semibold text-sm leading-tight line-clamp-1">{doc.title}</p>
          {doc.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
          )}
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3" /> {doc.viewCount ?? 0}
            </div>
            <div className={`${cfg.bg} ${cfg.color} text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize`}>
              {doc.fileType}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DocPreviewModal({ doc, onClose }: { doc: PublicDoc; onClose: () => void }) {
  const cfg = FILE_TYPE_CONFIG[doc.fileType] ?? FILE_TYPE_CONFIG.other;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className={`p-5 bg-gradient-to-r ${cfg.gradient} text-white`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs opacity-80 mb-1 capitalize">{doc.fileType}</p>
                <h2 className="font-serif text-xl font-bold leading-tight">{doc.title}</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div className="p-5 space-y-4">
            {doc.fileType === "image" && doc.fileUrl && (
              <div className="rounded-xl overflow-hidden border">
                <img src={doc.fileUrl} alt={doc.title} className="w-full object-contain max-h-[50vh]" />
              </div>
            )}
            {doc.fileType === "video" && doc.fileUrl && (
              <div className="rounded-xl overflow-hidden border bg-black">
                <video src={doc.fileUrl} controls className="w-full max-h-[50vh]" />
              </div>
            )}
            {doc.fileType === "audio" && doc.fileUrl && (
              <div className="p-6 rounded-xl border bg-muted/30 flex flex-col items-center gap-4">
                <Music className="h-12 w-12 text-muted-foreground" />
                <audio src={doc.fileUrl} controls className="w-full" />
              </div>
            )}
            {(doc.fileType === "document" || doc.fileType === "other") && (
              <div className={`p-8 rounded-xl border ${cfg.bg} flex flex-col items-center gap-3`}>
                <div className={cfg.color}>{cfg.icon}</div>
                <p className="font-semibold text-sm">{doc.fileName ?? doc.title}</p>
                {doc.fileUrl && (
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="rounded-full gap-2">
                      <ExternalLink className="h-3.5 w-3.5" /> Open Document
                    </Button>
                  </a>
                )}
              </div>
            )}

            {doc.description && (
              <p className="text-sm text-muted-foreground">{doc.description}</p>
            )}

            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map(t => (
                  <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">{t}</span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Publicly visible</span>
              <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

export default function PublicGallery({ unitType, unitId, unitName }: PublicGalleryProps) {
  const base = getApiBaseUrl();
  const [docs, setDocs] = useState<PublicDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<PublicDoc | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${base}/genhal/vault/public/${unitType}/${unitId}`)
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [unitType, unitId]);

  const filtered = filter === "all" ? docs : docs.filter(d => d.fileType === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-2xl font-bold">Public Heritage Archive</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Shared cultural documents, photographs, and media. Private and encrypted files are never shown here.
        </p>
      </div>

      {/* Encrypted notice */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900 text-white"
      >
        <Lock className="h-4 w-4 text-amber-400 shrink-0" />
        <p className="text-xs">
          <span className="font-semibold text-amber-400">Private &amp; Encrypted:</span>{" "}
          Sensitive documents (land titles, wills, court orders) are AES-256 encrypted and never visible here — only accessible to authorised members.
        </p>
      </motion.div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <motion.button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            whileTap={{ scale: 0.95 }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${filter === opt.value ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background hover:border-primary/50 text-muted-foreground"}`}
          >
            {opt.label}
            {filter === opt.value && docs.filter(d => opt.value === "all" || d.fileType === opt.value).length > 0 && (
              <span className="ml-1.5 text-xs opacity-70">
                {docs.filter(d => opt.value === "all" || d.fileType === opt.value).length}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Gallery grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-16 space-y-3"
        >
          <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="font-semibold text-muted-foreground">
            {filter === "all" ? "No public documents yet" : `No public ${filter}s yet`}
          </p>
          <p className="text-xs text-muted-foreground">
            Documents marked as "Public" by administrators will appear here.
          </p>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={filter}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {filtered.map(doc => (
              <FileCard key={doc.id} doc={doc} onClick={() => setSelected(doc)} />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Preview modal */}
      {selected && <DocPreviewModal doc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
