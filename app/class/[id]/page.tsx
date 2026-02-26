import ClassroomClient from "./ClassroomClient";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassroomClient classId={id} />;
}