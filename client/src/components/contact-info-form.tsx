import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, MapPin, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ContactInfoFormProps {
  onComplete: (contactInfo: {
    firstName: string;
    lastName: string;
    email: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  }) => void;
}

export function ContactInfoForm({ onComplete }: ContactInfoFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    streetAddress: "",
    city: "",
    state: "",
    zipCode: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(formData);
  };

  const isValid = formData.firstName && formData.lastName && formData.email && formData.streetAddress && formData.city && formData.state && formData.zipCode;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Complete Your Profile
          </CardTitle>
          <p className="text-gray-600">
            We need a few details to send you the best job matches in your area.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" className="text-lg font-medium flex items-center mb-2">
                  <User className="w-4 h-4 mr-2" />
                  First Name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="text-lg py-3"
                  placeholder="Enter your first name"
                  data-testid="input-first-name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="lastName" className="text-lg font-medium flex items-center mb-2">
                  <User className="w-4 h-4 mr-2" />
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="text-lg py-3"
                  placeholder="Enter your last name"
                  data-testid="input-last-name"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email" className="text-lg font-medium flex items-center mb-2">
                <Mail className="w-4 h-4 mr-2" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="text-lg py-3"
                placeholder="your.email@example.com"
                data-testid="input-email"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                We'll use this to send you job opportunities and updates.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Your Address
              </h3>
              <p className="text-sm text-gray-500">
                This helps us find jobs close to you and reduces commute time.
              </p>
              
              <div>
                <Label htmlFor="streetAddress" className="text-base font-medium mb-2 block">
                  Street Address
                </Label>
                <Input
                  id="streetAddress"
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => setFormData(prev => ({ ...prev, streetAddress: e.target.value }))}
                  className="text-lg py-3"
                  placeholder="123 Main Street"
                  data-testid="input-street-address"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city" className="text-base font-medium mb-2 block">
                    City
                  </Label>
                  <Input
                    id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    className="text-lg py-3"
                    placeholder="Your City"
                    data-testid="input-city"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="state" className="text-base font-medium mb-2 block">
                    State
                  </Label>
                  <Input
                    id="state"
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    className="text-lg py-3"
                    placeholder="CA"
                    data-testid="input-state"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="zipCode" className="text-base font-medium mb-2 block">
                    ZIP Code
                  </Label>
                  <Input
                    id="zipCode"
                    type="text"
                    value={formData.zipCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                    className="text-lg py-3"
                    placeholder="12345"
                    data-testid="input-zip-code"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                type="submit"
                disabled={!isValid}
                size="lg"
                className="w-full bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4"
                data-testid="button-complete-profile"
              >
                Complete Profile & See My Matches
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}