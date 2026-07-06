import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetEmailCampaign, useUpdateEmailCampaign, useCreateEmailCampaign, useSendEmailCampaign, getGetEmailCampaignQueryKey, getListEmailCampaignsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Save, CalendarClock, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function EmailCampaignEditor() {
  const params = useParams();
  const isNew = !params.id || params.id === "new";
  const id = isNew ? 0 : parseInt(params.id);
  const [, setLocation] = useLocation();

  const { data: campaign, isLoading } = useGetEmailCampaign(id, { 
    query: { enabled: !isNew && !!id, queryKey: getGetEmailCampaignQueryKey(id) } 
  });
  
  const createCampaign = useCreateEmailCampaign();
  const updateCampaign = useUpdateEmailCampaign();
  const sendCampaign = useSendEmailCampaign();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (campaign && !isNew) {
      setName(campaign.name);
      setSubject(campaign.subject);
      setTargetAudience(campaign.targetAudience || "");
      setBody(campaign.body);
    }
  }, [campaign, isNew]);

  const handleSave = async (status: 'draft' | 'scheduled') => {
    if (!name || !subject || !body) {
      toast.error("Name, subject, and body are required.");
      return;
    }

    try {
      if (isNew) {
        await createCampaign.mutateAsync({
          data: {
            vendorId: 1, // hardcoded for demo
            name,
            subject,
            targetAudience,
            body,
            recipientCount: 0
          }
        });
      } else {
        await updateCampaign.mutateAsync({
          id,
          data: { name, subject, targetAudience, body, status }
        });
      }
      queryClient.invalidateQueries({ queryKey: getListEmailCampaignsQueryKey() });
      if (!isNew) queryClient.invalidateQueries({ queryKey: getGetEmailCampaignQueryKey(id) });
      
      toast.success(isNew ? "Campaign created" : "Campaign saved");
      setLocation("/email-campaigns");
    } catch (e) {
      toast.error("Failed to save campaign");
    }
  };

  const handleSend = async () => {
    if (isNew) {
      toast.error("Please save the campaign first before sending.");
      return;
    }
    
    try {
      await sendCampaign.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetEmailCampaignQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListEmailCampaignsQueryKey() });
      toast.success("Campaign is sending!");
      setLocation("/email-campaigns");
    } catch (e) {
      toast.error("Failed to send campaign");
    }
  };

  if (!isNew && isLoading) return <div className="p-8">Loading campaign...</div>;

  const isSent = campaign?.status === 'sent';

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/email-campaigns"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {isNew ? "New Campaign" : campaign?.name}
              </h1>
              {!isNew && campaign && (
                <Badge variant={isSent ? 'default' : 'outline'}>{campaign.status}</Badge>
              )}
            </div>
          </div>
        </div>
        {!isSent && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave('draft')}>
              <Save className="w-4 h-4 mr-2" /> Save Draft
            </Button>
            <Button variant="secondary" onClick={() => handleSave('scheduled')}>
              <CalendarClock className="w-4 h-4 mr-2" /> Schedule
            </Button>
            {!isNew && (
              <Button onClick={handleSend} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Send className="w-4 h-4 mr-2" /> Send Now
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Name</label>
                <Input 
                  placeholder="e.g. Q3 Summer Sale Promo" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  disabled={isSent}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Subject</label>
                <Input 
                  placeholder="Don't miss our biggest sale of the year!" 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)}
                  disabled={isSent}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">HTML Body</label>
                <Textarea 
                  placeholder="<h1>Hello {{name}}</h1>..." 
                  className="min-h-[400px] font-mono text-sm resize-none"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  disabled={isSent}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audience & Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Audience Segment</label>
                <Input 
                  placeholder="e.g. 'Active Purchasers' or 'VIP tier'" 
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  disabled={isSent}
                />
              </div>
              {!isNew && campaign && (
                <div className="pt-4 border-t space-y-3 mt-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recipients</span>
                    <span className="font-medium">{campaign.recipientCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium capitalize">{campaign.status}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-muted/50 border-dashed">
             <CardContent className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
               <Mail className="w-12 h-12 mb-4 opacity-20" />
               <p className="text-sm">Preview rendering would appear here.</p>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}