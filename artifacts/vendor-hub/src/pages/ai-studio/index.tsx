import { useListAiGenerations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Image as ImageIcon, Video as VideoIcon, MessageSquare, Download } from "lucide-react";

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
          generations?.map((gen) => (
            <Card key={gen.id} className="overflow-hidden flex flex-col group">
              {gen.type === 'image' || gen.type === 'video' ? (
                <div className="aspect-square bg-muted relative group">
                  {gen.result ? (
                    gen.type === 'video' ? (
                      <video src={gen.result} controls loop className="w-full h-full object-cover bg-black" />
                    ) : (
                      <img src={gen.result} alt={gen.prompt} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">Generating...</div>
                  )}
                  {gen.result && (
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
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="capitalize text-xs">{gen.type}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(gen.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2" title={gen.prompt}>
                  <span className="font-semibold">Prompt:</span> {gen.prompt}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}