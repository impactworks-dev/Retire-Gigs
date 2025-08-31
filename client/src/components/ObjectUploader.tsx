import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { successful: { uploadURL: string }[] }) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A simple file upload component that handles resume file uploads
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    console.log("Upload button clicked!");
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    
    // Check file size
    if (file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `File size must be less than ${Math.round(maxFileSize / 1024 / 1024)}MB`,
        variant: "destructive",
      });
      return;
    }

    // Check file type
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileName = file.name.toLowerCase();
    const isValidType = allowedTypes.some(type => fileName.endsWith(type));
    
    if (!isValidType) {
      toast({
        title: "Invalid file type",
        description: "Only PDF, DOC, and DOCX files are allowed",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get upload URL
      console.log("Getting upload parameters...");
      const uploadParams = await onGetUploadParameters();
      console.log("Got upload URL:", uploadParams.url);

      // Upload file directly to the URL
      const response = await fetch(uploadParams.url, {
        method: uploadParams.method,
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      console.log("File uploaded successfully!");
      
      // Call completion callback
      onComplete?.({
        successful: [{ uploadURL: uploadParams.url }]
      });

      toast({
        title: "Upload successful",
        description: "Your file has been uploaded successfully!",
      });

    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        data-testid="input-file"
      />
      <Button 
        onClick={handleButtonClick} 
        className={buttonClassName}
        disabled={isUploading}
        data-testid="button-upload"
      >
        {isUploading ? "Uploading..." : children}
      </Button>
    </div>
  );
}