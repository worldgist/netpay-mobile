import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Eye, Save, Clock, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ContentPage {
  id: string;
  page_type: string;
  title: string;
  content: string;
  meta_description: string | null;
  is_published: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function ContentManagement() {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<ContentPage | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    fetchPages();

    // Real-time subscription
    const channel = supabase
      .channel('content-management')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_pages',
        },
        (payload) => {
          console.log('Content change detected:', payload);
          fetchPages();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPages = async () => {
    const { data, error } = await supabase
      .from("content_pages")
      .select("*")
      .order("page_type");

    if (error) {
      console.error("Error fetching pages:", error);
      toast.error("Failed to load content pages");
      return;
    }

    // Filter out about_us, faq, and support pages
    const excludedTypes = ['about_us', 'faq', 'support'];
    const filteredPages = (data || []).filter(
      (page) => !excludedTypes.includes(page.page_type.toLowerCase())
    );

    setPages(filteredPages);
  };

  const handleEdit = (page: ContentPage) => {
    setSelectedPage(page);
    setIsEditDialogOpen(true);
  };

  const handlePreview = (page: ContentPage) => {
    setSelectedPage(page);
    setIsPreviewDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPage) return;

    setIsSaving(true);
    const formData = new FormData(e.currentTarget);

    const { data: { user } } = await supabase.auth.getUser();

    const updates = {
      title: formData.get("title") as string,
      content: formData.get("content") as string,
      meta_description: formData.get("meta_description") as string,
      is_published: formData.get("is_published") === "true",
      last_updated_by: user?.id,
    };

    const { error } = await supabase
      .from("content_pages")
      .update(updates)
      .eq("id", selectedPage.id);

    if (error) {
      console.error("Error updating page:", error);
      toast.error("Failed to update page");
    } else {
      toast.success("Page updated successfully");
      fetchPages();
      setIsEditDialogOpen(false);
    }

    setIsSaving(false);
  };

  const handleTogglePublish = async (pageId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("content_pages")
      .update({ is_published: !currentStatus })
      .eq("id", pageId);

    if (error) {
      toast.error("Failed to update publish status");
      return;
    }

    toast.success(currentStatus ? "Page unpublished" : "Page published");
    fetchPages();
  };

  const getPageTypeLabel = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const renderMarkdown = (content: string) => {
    // Simple markdown to HTML conversion for preview
    return content
      .split("\n")
      .map((line) => {
        if (line.startsWith("# ")) return `<h1 class="text-3xl font-bold mb-4">${line.slice(2)}</h1>`;
        if (line.startsWith("## ")) return `<h2 class="text-2xl font-bold mb-3">${line.slice(3)}</h2>`;
        if (line.startsWith("### ")) return `<h3 class="text-xl font-bold mb-2">${line.slice(4)}</h3>`;
        if (line.startsWith("- ")) return `<li class="ml-4">${line.slice(2)}</li>`;
        if (line.startsWith("**") && line.endsWith("**")) {
          return `<p class="font-bold mb-2">${line.slice(2, -2)}</p>`;
        }
        if (line.trim() === "") return "<br />";
        return `<p class="mb-2">${line}</p>`;
      })
      .join("");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold">Content Management</h1>
                  <p className="text-xs text-muted-foreground">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1">
                <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                Live Updates
              </Badge>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pages.map((page) => (
                <Card key={page.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          {getPageTypeLabel(page.page_type)}
                        </CardTitle>
                        <CardDescription>{page.meta_description}</CardDescription>
                      </div>
                      <Badge variant={page.is_published ? "default" : "secondary"}>
                        {page.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {new Date(page.updated_at).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreview(page)}
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleEdit(page)}
                        className="flex-1"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Label htmlFor={`publish-${page.id}`} className="text-sm">
                        Published
                      </Label>
                      <Switch
                        id={`publish-${page.id}`}
                        checked={page.is_published}
                        onCheckedChange={() => handleTogglePublish(page.id, page.is_published)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {selectedPage && getPageTypeLabel(selectedPage.page_type)}
            </DialogTitle>
            <DialogDescription>
              Update the content and settings for this page
            </DialogDescription>
          </DialogHeader>

          {selectedPage && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Page Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={selectedPage.title}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta_description">Meta Description</Label>
                <Input
                  id="meta_description"
                  name="meta_description"
                  defaultValue={selectedPage.meta_description || ""}
                  placeholder="Brief description for SEO"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content (Markdown supported)</Label>
                <Textarea
                  id="content"
                  name="content"
                  defaultValue={selectedPage.content}
                  rows={20}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Use # for headings, ## for subheadings, - for lists, **text** for bold
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="is_published"
                  name="is_published"
                  defaultChecked={selectedPage.is_published}
                  value="true"
                />
                <Label htmlFor="is_published">Published</Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Save className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPage && selectedPage.title}
            </DialogTitle>
          </DialogHeader>

          {selectedPage && (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPage.content) }}
            />
          )}

          <DialogFooter>
            <Button onClick={() => setIsPreviewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
