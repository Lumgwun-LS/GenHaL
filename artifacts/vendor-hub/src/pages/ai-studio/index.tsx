import { useListAiGenerations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Image as ImageIcon, Video as VideoIcon, MessageSquare, Download, Clock, Trash2 } from "lucide-react";

export default function AiStudio() {
  const { data: generations, isLoading } = useListAiGenerations();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Studio</h1>
          <p className="text-muted-foreground">Generate brand imagery and viral captions instantly.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <MessageSquare className="w-4 h-4 mr-2" />
            Generate Caption
          </Button>
          <Button>
            <ImageIcon className="w-4 h-4 mr-2" />
            Generate Image
          </Button>
          <Button variant="outline">
            <VideoIcon className="w-4 h-4 mr-2" />
            Generate Video
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Loading studio history...</div>
        ) : generations?.length === 0 ? (
          <div className="col-span-full text-center py-20 text-muted-foreground border border-dashed rounded-xl bg-card">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground mb-1">Your studio is empty</h3>
            <p>Start generating content using the buttons above.</p>
          </div>
        ) : (
          generations?.map((gen) => {
            const isDeleted = !!gen.mediaDeletedAt;
            const isExpiringSoon = !isDeleted && !!gen.mediaWarningSentAt;
            const isMedia = gen.type === "image" || gen.type === "video";

            return (
              <Card key={gen.id} className={`overflow-hidden flex flex-col group ${isExpiringSoon ? "border-amber-400/60" : ""} ${isDeleted ? "opacity-60" : ""}`}>
                {isMedia ? (
                  <div className="aspect-square bg-muted relative group">
                    {isDeleted ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 bg-muted/80">
                        <Trash2 className="w-8 h-8 opacity-40" />
                        <span className="text-xs text-center px-4">This file has been deleted. Attach media to a post to preserve future generations.</span>
                      </div>
                    ) : gen.result ? (
                      gen.type === "video" ? (
                        <video src={gen.result} controls loop className="w-full h-full object-cover bg-black" />
                      ) : (
                        <img src={gen.result} alt={gen.prompt} className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">Generating...</div>
                    )}

                    {/* Expiry warning banner — shown when the file is still alive but flagged for deletion */}
                    {isExpiringSoon && !isDeleted && (
                      <div className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-white text-[10px] font-medium px-2 py-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        Expires soon — attach to a post to keep
                      </div>
                    )}

                    {gen.result && !isDeleted && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
                        <Button variant="secondary" size="icon"><Download className="w-4 h-4" /></Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 flex-1 bg-muted/30">
                    <MessageSquare className="w-6 h-6 text-primary mb-4" />
                    <p className="text-sm leading-relaxed font-medium">
                      {gen.result || "Generating caption..."}
                    </p>
                  </div>
                )}

                <CardContent className="p-4 bg-card border-t mt-auto">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <Badge variant="outline" className="capitalize text-xs">{gen.type}</Badge>
                    <div className="flex items-center gap-1">
                      {isDeleted && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <Trash2 className="w-2.5 h-2.5 mr-0.5" />
                          Deleted
                        </Badge>
                      )}
                      {isExpiringSoon && !isDeleted && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white border-0">
                          <Clock className="w-2.5 h-2.5 mr-0.5" />
                          Expires soon
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">{new Date(gen.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2" title={gen.prompt}>
                    <span className="font-semibold">Prompt:</span> {gen.prompt}
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
