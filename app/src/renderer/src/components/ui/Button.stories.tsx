import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta = {
  title: "UI Kit/Button",
  component: Button,
  args: { children: "New project", variant: "primary", size: "md" },
  argTypes: {
    variant: { control: "radio", options: ["primary", "secondary", "tertiary", "danger"] },
    size: { control: "radio", options: ["sm", "md"] },
    icon: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: "secondary", children: "Back" } };

export const Tertiary: Story = { args: { variant: "tertiary", children: "Settings" } };

export const Danger: Story = { args: { variant: "danger", children: "Delete" } };

export const WithIcon: Story = { args: { icon: "clapboard-wide", children: "New project" } };

export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(["md", "sm"] as const).map((size) => (
        <div key={size} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Button variant="primary" size={size}>
            Button
          </Button>
          <Button variant="secondary" size={size}>
            Button
          </Button>
          <Button variant="tertiary" size={size}>
            Button
          </Button>
          <Button variant="danger" size={size}>
            Button
          </Button>
          <Button variant="primary" size={size} disabled>
            Button
          </Button>
        </div>
      ))}
    </div>
  ),
};
