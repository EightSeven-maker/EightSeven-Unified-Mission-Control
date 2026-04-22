import { SkillsView } from "@/components/skills-view";

type SkillPageProps = {
  params: Promise<{ name: string }>;
};

export default async function SkillPage({ params }: SkillPageProps) {
  const { name } = await params;

  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    decoded = name;
  }

  return <SkillsView initialSkillName={decoded} />;
}
