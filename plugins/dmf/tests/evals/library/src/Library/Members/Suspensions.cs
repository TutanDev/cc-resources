namespace Library.Members;

public static class Suspensions
{
    public static void Suspend(Member member, DateTime until, string reason)
    {
        member.IsSuspended = true;
        member.SuspendedUntil = until;
        member.SuspensionReason = reason;
    }

    public static void Lift(Member member)
    {
        member.IsSuspended = false;
    }
}
