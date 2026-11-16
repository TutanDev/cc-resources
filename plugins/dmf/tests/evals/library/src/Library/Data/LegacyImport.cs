using System.Globalization;
using Library.Members;

namespace Library.Data;

// Reads the members exported from the old circulation system, one per line:
// id;name;junior;fines;suspended
public static class LegacyImport
{
    public static Member ParseLine(string line)
    {
        var parts = line.Split(';');
        return new Member
        {
            Id = parts[0],
            Name = parts[1],
            IsJunior = parts[2] == "1",
            UnpaidFines = decimal.Parse(parts[3], CultureInfo.InvariantCulture),
            IsSuspended = parts[4] == "1",
        };
    }
}
