import { HermesPanel } from "@/components/hermes-panel";
import { SectionBody, SectionHeader, SectionLayout } from "@/components/section-layout";

export default function HermesPage() {
  return (
    <SectionLayout>
      <SectionHeader
        title="Harvey"
        description="Control Harvey, your Hermes agent — messages, status, and quick actions."
      />
      <SectionBody width="content" padding="regular" innerClassName="space-y-6">
        <HermesPanel />
      </SectionBody>
    </SectionLayout>
  );
}