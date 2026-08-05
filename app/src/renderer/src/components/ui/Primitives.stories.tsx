import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { ShaderOrb } from "./ShaderOrb";
import { Thumbnail } from "./Thumbnail";
import { Tooltip } from "./Tooltip";

/** New v1.5 primitives: Tooltip, Thumbnail, ShaderOrb. */
const meta = {
  title: "UI Kit/Primitives",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <div style={{ padding: 48 }}>
      <Tooltip label="Tooltip label">
        <IconButton icon="settings-gear" label="Settings" />
      </Tooltip>
    </div>
  ),
};

export const ThumbnailSizes: Story = {
  name: "Thumbnail",
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
      {[16, 20, 24, 32, 40].map((size) => (
        <Thumbnail key={size} src={null} size={size} />
      ))}
      <Thumbnail src={null} size={64} duration="00:21" />
    </div>
  ),
};

export const ShaderOrbs: Story = {
  name: "ShaderOrb",
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <ShaderOrb type="generation" size={18} />
      <ShaderOrb type="critique" size={18} />
      <ShaderOrb type="generation" size={18} spinning />
    </div>
  ),
};
