import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Plus, Trash2, Upload, FileText, Download, Star, Edit3 } from "lucide-react";
import type { Resume } from "@shared/schema";
import type { UploadResult } from "@uppy/core";

const resumeFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    year: z.string(),
    details: z.string().optional()
  })).optional(),
  workExperience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string().optional()
  })).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string().optional()
  })).optional(),
  achievements: z.array(z.string()).optional()
});

type ResumeFormData = z.infer<typeof resumeFormSchema>;

export default function ResumeBuilder() {
  const [activeTab, setActiveTab] = useState("list");
  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [newSkill, setNewSkill] = useState("");
  const [newAchievement, setNewAchievement] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ResumeFormData>({
    resolver: zodResolver(resumeFormSchema),
    defaultValues: {
      title: "",
      summary: "",
      skills: [],
      education: [],
      workExperience: [],
      certifications: [],
      achievements: []
    }
  });

  // Fetch user's resumes
  const { data: resumes, isLoading } = useQuery({
    queryKey: ["/api/resumes"],
  });

  // Create resume mutation
  const createResumeMutation = useMutation({
    mutationFn: async (data: ResumeFormData) => {
      const res = await apiRequest("POST", "/api/resumes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({
        title: "Success",
        description: "Resume created successfully!",
      });
      setActiveTab("list");
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create resume. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update resume mutation
  const updateResumeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ResumeFormData> }) => {
      const res = await apiRequest("PATCH", `/api/resumes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({
        title: "Success",
        description: "Resume updated successfully!",
      });
      setEditingResume(null);
      setActiveTab("list");
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update resume. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Delete resume mutation
  const deleteResumeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/resumes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({
        title: "Success",
        description: "Resume deleted successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete resume. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Set default resume mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/resumes/${id}/default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({
        title: "Success",
        description: "Default resume updated!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to set default resume.",
        variant: "destructive",
      });
    }
  });

  const handleGetUploadParameters = async () => {
    try {
      console.log("Getting upload parameters...");
      const response = await apiRequest("POST", "/api/resumes/upload");
      const data = await response.json();
      console.log("Upload response:", data);
      return {
        method: "PUT" as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error("Error getting upload parameters:", error);
      toast({
        title: "Upload Error",
        description: "Failed to get upload URL. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleUploadComplete = async (result: { successful: { uploadURL: string }[] }) => {
    console.log("Upload complete result:", result);
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const uploadURL = uploadedFile.uploadURL;
      
      // Create a new resume with the uploaded file
      try {
        console.log("Creating resume with upload URL:", uploadURL);
        const res = await apiRequest("POST", "/api/resumes", {
          title: `Uploaded Resume - ${new Date().toLocaleDateString()}`,
          uploadedFileUrl: uploadURL
        });
        const newResume = await res.json();

        console.log("Created resume:", newResume);

        // Set ACL policy for the uploaded file and parse content
        const parseRes = await apiRequest("PUT", `/api/resumes/${newResume.id}/upload`, {
          uploadedFileUrl: uploadURL
        });
        const parseResult = await parseRes.json();

        queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });

        if (parseResult.parsed && parseResult.parsedData) {
          // If parsing was successful, switch to edit mode with parsed data
          setEditingResume(parseResult.resume);
          form.reset({
            title: parseResult.parsedData.title || parseResult.resume.title,
            summary: parseResult.parsedData.summary || "",
            skills: Array.isArray(parseResult.parsedData.skills) ? parseResult.parsedData.skills : [],
            education: Array.isArray(parseResult.parsedData.education) ? parseResult.parsedData.education : [],
            workExperience: Array.isArray(parseResult.parsedData.workExperience) ? parseResult.parsedData.workExperience : [],
            certifications: Array.isArray(parseResult.parsedData.certifications) ? parseResult.parsedData.certifications : [],
            achievements: Array.isArray(parseResult.parsedData.achievements) ? parseResult.parsedData.achievements : []
          });
          setActiveTab("builder");
          
          toast({
            title: "Resume Parsed Successfully!",
            description: "Your resume has been uploaded and parsed. You can now edit the extracted information.",
          });
        } else {
          toast({
            title: "Upload Successful!",
            description: "Your resume has been uploaded. You can create a new resume manually.",
          });
        }
      } catch (error) {
        console.error("Error processing uploaded resume:", error);
        toast({
          title: "Error",
          description: "Failed to process uploaded resume.",
          variant: "destructive",
        });
      }
    } else {
      console.error("Upload failed or no files uploaded:", result);
      toast({
        title: "Upload Failed",
        description: "No files were uploaded successfully.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: ResumeFormData) => {
    if (editingResume) {
      updateResumeMutation.mutate({ id: editingResume.id, data });
    } else {
      createResumeMutation.mutate(data);
    }
  };

  const startEditing = (resume: Resume) => {
    setEditingResume(resume);
    form.reset({
      title: resume.title,
      summary: resume.summary || "",
      skills: Array.isArray(resume.skills) ? resume.skills as string[] : [],
      education: Array.isArray(resume.education) ? resume.education as any[] : [],
      workExperience: Array.isArray(resume.workExperience) ? resume.workExperience as any[] : [],
      certifications: Array.isArray(resume.certifications) ? resume.certifications as any[] : [],
      achievements: Array.isArray(resume.achievements) ? resume.achievements as string[] : []
    });
    setActiveTab("builder");
  };

  const addSkill = () => {
    if (newSkill.trim()) {
      const currentSkills = form.getValues("skills") || [];
      form.setValue("skills", [...currentSkills, newSkill.trim()]);
      setNewSkill("");
    }
  };

  const removeSkill = (index: number) => {
    const currentSkills = form.getValues("skills") || [];
    form.setValue("skills", currentSkills.filter((_, i) => i !== index));
  };

  const addAchievement = () => {
    if (newAchievement.trim()) {
      const currentAchievements = form.getValues("achievements") || [];
      form.setValue("achievements", [...currentAchievements, newAchievement.trim()]);
      setNewAchievement("");
    }
  };

  const removeAchievement = (index: number) => {
    const currentAchievements = form.getValues("achievements") || [];
    form.setValue("achievements", currentAchievements.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your resumes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Resume Builder</h1>
        <p className="text-gray-600">Create professional resumes tailored for retirement jobs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list" data-testid="tab-resume-list">
            <FileText className="w-4 h-4 mr-2" />
            My Resumes
          </TabsTrigger>
          <TabsTrigger value="builder" data-testid="tab-resume-builder">
            <Plus className="w-4 h-4 mr-2" />
            {editingResume ? "Edit Resume" : "Create Resume"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Your Resumes</h2>
              <div className="flex gap-3">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={5242880} // 5MB
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                  buttonClassName="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Resume
                </ObjectUploader>
                <Button
                  onClick={() => {
                    setEditingResume(null);
                    form.reset();
                    setActiveTab("builder");
                  }}
                  data-testid="button-create-resume"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New
                </Button>
              </div>
            </div>

            {resumes && Array.isArray(resumes) && resumes.length > 0 ? (
              <div className="grid gap-4">
                {resumes.map((resume: Resume) => (
                  <Card key={resume.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{resume.title}</CardTitle>
                          {resume.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="w-3 h-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!resume.isDefault && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(resume.id)}
                              data-testid={`button-set-default-${resume.id}`}
                            >
                              Set as Default
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(resume)}
                            data-testid={`button-edit-${resume.id}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteResumeMutation.mutate(resume.id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`button-delete-${resume.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {resume.summary && (
                        <CardDescription className="mt-2">
                          {resume.summary}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {resume.uploadedFileUrl && (
                          <Badge variant="outline">Uploaded File</Badge>
                        )}
                        {resume.skills && Array.isArray(resume.skills) && resume.skills.length > 0 && (
                          <Badge variant="outline">
                            {resume.skills.length} Skills
                          </Badge>
                        )}
                        {resume.workExperience && Array.isArray(resume.workExperience) && resume.workExperience.length > 0 && (
                          <Badge variant="outline">
                            {resume.workExperience.length} Jobs
                          </Badge>
                        )}
                        {resume.education && Array.isArray(resume.education) && resume.education.length > 0 && (
                          <Badge variant="outline">
                            {resume.education.length} Education
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 text-sm text-gray-500">
                        Created: {new Date(resume.createdAt || "").toLocaleDateString()}
                        {resume.updatedAt && resume.updatedAt !== resume.createdAt && (
                          <span className="ml-4">
                            Updated: {new Date(resume.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No resumes yet</h3>
                <p className="text-gray-600 mb-6">
                  Create your first resume or upload an existing one to get started.
                </p>
                <div className="flex justify-center gap-3">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5242880} // 5MB
                    onGetUploadParameters={handleGetUploadParameters}
                    onComplete={handleUploadComplete}
                    buttonClassName="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Resume
                  </ObjectUploader>
                  <Button
                    onClick={() => {
                      setEditingResume(null);
                      form.reset();
                      setActiveTab("builder");
                    }}
                    data-testid="button-create-first-resume"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Resume
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="builder" className="mt-6">
          {editingResume && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <Edit3 className="w-5 h-5" />
                <h3 className="font-semibold">Editing Resume: {editingResume.title}</h3>
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                Edit the information below and click "Save Resume" when you're done.
              </p>
            </div>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>
                    Start with the basic details of your resume
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resume Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Senior Customer Service Representative"
                            {...field}
                            data-testid="input-resume-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="summary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Professional Summary</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Write a brief summary highlighting your experience and what you're looking for in your next role..."
                            rows={4}
                            {...field}
                            data-testid="textarea-resume-summary"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Skills Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Skills</CardTitle>
                  <CardDescription>
                    Add your key skills and competencies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                      data-testid="input-new-skill"
                    />
                    <Button type="button" onClick={addSkill} data-testid="button-add-skill">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.watch("skills")?.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(index)}
                          className="ml-1 hover:text-red-600"
                          data-testid={`button-remove-skill-${index}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Achievements Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Key Achievements</CardTitle>
                  <CardDescription>
                    Highlight your notable accomplishments and recognition
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add an achievement"
                      value={newAchievement}
                      onChange={(e) => setNewAchievement(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addAchievement())}
                      data-testid="input-new-achievement"
                    />
                    <Button type="button" onClick={addAchievement} data-testid="button-add-achievement">
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.watch("achievements")?.map((achievement, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                        <span className="flex-1">{achievement}</span>
                        <button
                          type="button"
                          onClick={() => removeAchievement(index)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-remove-achievement-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Separator />

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveTab("list");
                    setEditingResume(null);
                    form.reset();
                  }}
                  data-testid="button-cancel-resume"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createResumeMutation.isPending || updateResumeMutation.isPending}
                  data-testid="button-save-resume"
                >
                  {createResumeMutation.isPending || updateResumeMutation.isPending
                    ? "Saving..."
                    : editingResume
                    ? "Update Resume"
                    : "Create Resume"}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  );
}