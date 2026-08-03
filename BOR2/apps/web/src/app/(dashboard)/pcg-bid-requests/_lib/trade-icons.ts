import {
  AirVent, Blocks, BrickWall, CloudRain, Droplets, Fence, Frame, Grid2x2, Hammer,
  House, Layers, PaintRoller, PanelsTopLeft, Rows3, Rows4, Ruler, Shovel, ShowerHead,
  Trees, Zap,
} from "lucide-react"
import type { TradeIconKey } from "./types"

export const TRADE_ICONS: Record<TradeIconKey, { icon: React.ElementType; label: string }> = {
  foundation:  { icon: Blocks,         label: "Foundation" },
  excavation:  { icon: Shovel,         label: "Excavation" },
  framing:     { icon: Frame,          label: "Framing" },
  deck:        { icon: Fence,          label: "Deck / fence" },
  glass:       { icon: ShowerHead,     label: "Glass / shower" },
  landscaping: { icon: Trees,          label: "Landscaping" },
  plumbing:    { icon: Droplets,       label: "Plumbing" },
  electrical:  { icon: Zap,            label: "Electrical" },
  hvac:        { icon: AirVent,        label: "HVAC" },
  insulation:  { icon: Layers,         label: "Insulation" },
  roofing:     { icon: House,          label: "Roofing" },
  gutters:     { icon: CloudRain,      label: "Gutters" },
  siding:      { icon: Rows3,          label: "Siding" },
  masonry:     { icon: BrickWall,      label: "Masonry" },
  drywall:     { icon: PanelsTopLeft,  label: "Drywall" },
  painting:    { icon: PaintRoller,    label: "Painting" },
  tile:        { icon: Grid2x2,        label: "Tile" },
  flooring:    { icon: Rows4,          label: "Flooring" },
  trim:        { icon: Ruler,          label: "Trim / finish" },
  general:     { icon: Hammer,         label: "General" },
}

export const TRADE_ICON_KEYS = Object.keys(TRADE_ICONS) as TradeIconKey[]

export function tradeIcon(key: TradeIconKey): React.ElementType {
  return TRADE_ICONS[key]?.icon ?? Hammer
}
