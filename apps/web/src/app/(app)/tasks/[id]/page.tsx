import { TaskRoom } from "@/components/task-room/task-room";

export default async function TaskRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskRoom taskId={id} />;
}
