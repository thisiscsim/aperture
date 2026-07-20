import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { Field, Input } from "./Input";
import { Modal } from "./Modal";

const meta = {
  title: "UI Kit/Modal",
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;

export const Dialog: StoryObj = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        {open && (
          <Modal
            title="New album"
            onClose={() => setOpen(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Create album
                </Button>
              </>
            }
          >
            <Field label="Name">
              <Input autoFocus placeholder="e.g. New York City" />
            </Field>
          </Modal>
        )}
      </>
    );
  },
};
