namespace Library.Members;

// The line the member app shows under the member's name.
public static class MemberCard
{
    public static string StandingLine(Member member, DateTime today)
    {
        if (member.IsSuspended && member.SuspendedUntil > today)
            return $"Suspended until {member.SuspendedUntil:d MMM yyyy}: {member.SuspensionReason}";
        if (member.UnpaidFines > 0)
            return $"Owes {member.UnpaidFines:0.00} in fines";
        return "In good standing";
    }
}
