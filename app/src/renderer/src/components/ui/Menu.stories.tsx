import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { Menu, MenuHeader, MenuItem, MenuSection, MenuSub } from "./Menu";

const meta = {
  title: "UI/Menu",
  component: Menu,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    popClassName: "tile-menu-pop",
    trigger: (toggle, open) => (
      <IconButton icon="ellipsis" label="Options" className={open ? "open" : ""} onClick={toggle} />
    ),
    children: (
      <>
        <MenuItem icon="input-form">Rename project</MenuItem>
        <MenuItem icon="move-folder">Remove from album</MenuItem>
        <MenuItem icon="trash-can" danger>
          Delete project
        </MenuItem>
      </>
    ),
  },
};

export const WithSubmenu: Story = {
  args: {
    popClassName: "tile-menu-pop",
    trigger: (toggle) => <IconButton icon="ellipsis" label="Options" onClick={toggle} />,
    children: (
      <>
        <MenuSub icon="move-folder" label="Move to album">
          <MenuItem icon="plus-large">New album</MenuItem>
          <MenuItem>Spring lookbook</MenuItem>
          <MenuItem>Tokyo trip</MenuItem>
        </MenuSub>
        <MenuItem icon="input-form">Rename project</MenuItem>
        <MenuItem icon="trash-can" danger>
          Delete project
        </MenuItem>
      </>
    ),
  },
};

export const StackedItems: Story = {
  name: "Stacked (label + hint)",
  args: {
    popClassName: "tile-menu-pop",
    trigger: (toggle) => <IconButton icon="magic-wand" label="Presets" onClick={toggle} />,
    children: (
      <>
        <MenuItem hint="Bold captions, hard cuts">Hype</MenuItem>
        <MenuItem hint="Muted palette, slow pacing">Editorial</MenuItem>
        <MenuItem hint="Clean sans, high contrast">Minimal</MenuItem>
      </>
    ),
  },
};

export const Sectioned: Story = {
  name: "Sections with headers",
  args: {
    popClassName: "tile-menu-pop",
    trigger: (toggle) => <IconButton icon="ellipsis" label="Tools" onClick={toggle} />,
    children: (
      <>
        <MenuSection>
          <MenuHeader>Tools</MenuHeader>
          <MenuItem icon="folder-add-left">Move to album</MenuItem>
          <MenuItem icon="folder-add-left">Move to album</MenuItem>
        </MenuSection>
        <MenuSection>
          <MenuHeader>More</MenuHeader>
          <MenuItem icon="trash-can" danger>
            Delete project
          </MenuItem>
        </MenuSection>
      </>
    ),
  },
};
