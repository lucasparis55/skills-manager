import React, { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface FormField {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: 'text' | 'password';
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => void;
  submitLabel?: string;
}

const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onSubmit,
  submitLabel = 'Create',
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && !initialized) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        if (f.defaultValue) initial[f.name] = f.defaultValue;
      });
      setValues(initial);
      setInitialized(true);
    }
    if (!newOpen) {
      setValues({});
      setInitialized(false);
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasEmptyRequired = fields.some(
      (f) => f.required && !values[f.name]?.trim()
    );
    if (hasEmptyRequired) return;
    onSubmit(values);
    setValues({});
    onOpenChange(false);
  };

  const isSubmitDisabled = fields.some(
    (f) => f.required && !values[f.name]?.trim()
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="text-sm text-slate-400 mb-4">
              {description}
            </DialogPrimitive.Description>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                <input
                  type={field.type || 'text'}
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-2">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
                  isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {submitLabel}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default FormDialog;
