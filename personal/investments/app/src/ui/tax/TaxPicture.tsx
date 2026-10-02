import { Badge, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { ShareBar } from "../ShareBar";
import { formatCurrency, formatRate } from "../format";
import type { TaxTile } from "./tiles";

function FigureTile({ tile }: { tile: TaxTile }) {
  return (
    <Card data-tax-tile={tile.key}>
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">
          {tile.label}
        </Text>
        <Text size="5" weight="bold" color={tile.tone === "gray" ? undefined : tile.tone}>
          {formatCurrency(tile.amount)}
        </Text>
        <Text size="1" color="gray">
          {tile.note}
        </Text>
      </Flex>
    </Card>
  );
}

export interface PersonalPictureProps {
  year: number;
  tiles: readonly TaxTile[];
  estimatedTax: number;
  marginalRatePercent: number;
}

/** The personal "Your &lt;year&gt; tax picture": the tiles grid plus the one emphasized estimated-tax line. */
export function PersonalTaxPicture({
  year,
  tiles,
  estimatedTax,
  marginalRatePercent,
}: PersonalPictureProps) {
  return (
    <Flex direction="column" gap="3" data-tax-picture="personal">
      <Heading size="5" as="h2">
        Your {year} tax picture
      </Heading>
      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        {tiles.map((tile) => (
          <FigureTile key={tile.key} tile={tile} />
        ))}
      </Grid>
      <Text size="3" data-estimated-tax-line="">
        Estimated tax from these accounts: <Text weight="bold">{formatCurrency(estimatedTax)}</Text>{" "}
        at your {formatRate(marginalRatePercent)} marginal rate (an estimate, set in data/tax.json).
      </Text>
    </Flex>
  );
}

export interface CorporatePictureProps {
  year: number;
  tiles: readonly TaxTile[];
  aaii: number;
  sbdEliminated: boolean;
}

const SBD_LOWER = 50000;

/** The corporate "Your &lt;year&gt; tax picture": the tiles grid plus the AAII share bar against the SBD grind band. */
export function CorporateTaxPicture({ year, tiles, aaii, sbdEliminated }: CorporatePictureProps) {
  const share = Math.min(aaii / SBD_LOWER, 1.5);
  return (
    <Flex direction="column" gap="3" data-tax-picture="corporate">
      <Heading size="5" as="h2">
        Your fiscal {year} tax picture
      </Heading>
      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        {tiles.map((tile) => (
          <FigureTile key={tile.key} tile={tile} />
        ))}
      </Grid>
      <Flex direction="column" gap="2">
        <Text size="2" data-aaii-share="">
          Passive income is {formatCurrency(aaii)}, {formatRate((aaii / SBD_LOWER) * 100)} of the
          $50,000 small-business-rate band.
        </Text>
        <ShareBar label="Passive income against the $50,000 band" share={share} />
        <Flex gap="2" wrap="wrap">
          <Badge color={aaii > SBD_LOWER ? "amber" : "jade"} variant="soft" highContrast>
            {aaii > SBD_LOWER ? "Over" : "Under"} $50,000
          </Badge>
          <Badge color={sbdEliminated ? "red" : "jade"} variant="soft" highContrast>
            {sbdEliminated ? "Over" : "Under"} $150,000
          </Badge>
        </Flex>
      </Flex>
    </Flex>
  );
}
