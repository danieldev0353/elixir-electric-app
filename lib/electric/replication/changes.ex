defmodule Electric.Replication.Changes do
  defmodule Transaction do
    defstruct [:changes, :commit_timestamp]
  end

  defmodule NewRecord do
    defstruct [:relation, :record]

    defimpl Electric.Replication.ToVaxine do
      alias Electric.Replication.Row
      alias Electric.VaxRepo

      def handle_change(%{record: record, relation: {schema, table}}) do
        row =
          schema
          |> Row.new(table, record)
          |> Row.force_deleted_update(false)

        case VaxRepo.insert(row) do
          {:ok, _} -> :ok
          error -> error
        end
      end
    end
  end

  defmodule UpdatedRecord do
    defstruct [:relation, :old_record, :record]

    defimpl Electric.Replication.ToVaxine do
      alias Electric.Replication.Row

      def handle_change(%{old_record: old_record, record: new_record, relation: {schema, table}}) do
        schema
        |> Row.new(table, old_record)
        |> Ecto.Changeset.change(row: new_record)
        |> Row.force_deleted_update(false)
        |> Electric.VaxRepo.update()
        |> case do
          {:ok, _} -> :ok
          error -> error
        end
      end
    end
  end

  defmodule DeletedRecord do
    defstruct [:relation, :old_record]

    defimpl Electric.Replication.ToVaxine do
      alias Electric.Replication.Row

      def handle_change(%{old_record: old_record, relation: {schema, table}}) do
        schema
        |> Row.new(table, old_record)
        |> Row.force_deleted_update(true)
        |> Electric.VaxRepo.update()
        |> case do
          {:ok, _} -> :ok
          error -> error
        end
      end
    end
  end

  defmodule TruncatedRelation do
    defstruct [:relation]
  end
end