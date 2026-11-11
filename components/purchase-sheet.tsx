import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/text";
import { Button, FieldLabel } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { asUpload, pickFromLibrary, takePhoto } from "@/lib/photos";

/**
 * "Record a cost": what the technician paid for a job - a part bought on site
 * (receipt and a photo of the part), or travel, labour, hire or another
 * expense. One sheet for a maintenance visit and an installation alike.
 */
type Upload = ReturnType<typeof asUpload>;
export interface BuyForm {
  kind: string; description: string; quantity: string; amount: string; shop: string;
  receipt: Upload | null; receiptName: string; photo: Upload | null;
}
/** A cost the technician paid, as the server lists it. */
export interface Purchase {
  id: string; kind?: string; kind_display?: string; description: string; quantity: number; amount: string; shop: string;
  receipt: string; photo: string; bought_by: string | null; bought_by_name: string | null; created_at: string;
}

/** What a job's cost can be, as the web names them. */
export const COST_KINDS = [
  { id: "part", label: "Part bought" }, { id: "travel", label: "Travel & fuel" }, { id: "labour", label: "Labour" },
  { id: "hire", label: "Equipment hire" }, { id: "other", label: "Other expense" },
];
export const kindLabel = (k?: string) => COST_KINDS.find((c) => c.id === k)?.label ?? "Part bought";
export const money = (n: number) => `PKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const emptyBuy = (): BuyForm => ({
  kind: "part", description: "", quantity: "1", amount: "", shop: "", receipt: null, receiptName: "", photo: null,
});

/** What is missing, or null when it can be saved. */
export function buyError(b: BuyForm): string | null {
  const part = b.kind === "part";
  if (!b.description.trim()) return part ? "Say what you bought" : "Say what it was for";
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return part ? "Enter the amount on the receipt" : "Enter what it came to";
  // A part needs the receipt and a photo of it; another cost keeps a receipt only if there is one.
  if (part && !b.receipt) return "Add the receipt";
  if (part && !b.photo) return "Take a photo of the component";
  return null;
}

/** The multipart form the purchase goes up as, plus the figures for the offline overlay. */
export function buyUpload(b: BuyForm, link: Record<string, string>) {
  const quantity = b.kind === "part" ? Math.max(1, Number(b.quantity) || 1) : 1;
  const amount = Number(b.amount).toFixed(2);
  return {
    quantity, amount,
    form: {
      fields: {
        ...link, kind: b.kind, description: b.description.trim(), quantity: String(quantity), amount,
        ...(b.shop.trim() ? { shop: b.shop.trim() } : {}),
      },
      files: [
        ...(b.receipt ? [{ ...(b.receipt as unknown as { uri: string; name: string; type: string }), field: "receipt" }] : []),
        ...(b.photo ? [{ ...(b.photo as unknown as { uri: string; name: string; type: string }), field: "photo" }] : []),
      ],
    },
  };
}

export function PurchaseSheet({ buy, setBuy, onSave, after }: {
  buy: BuyForm | null;
  setBuy: (f: (cur: BuyForm | null) => BuyForm | null) => void;
  onSave: () => void;
  /** Where the cost ends up, said under the form for anything but a part. */
  after: string;
}) {
  return (
    <Modal visible={!!buy} transparent animationType="slide" onRequestClose={() => setBuy(() => null)}>
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record a cost</Text>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <View>
              <FieldLabel>What for</FieldLabel>
              <View style={styles.kindRow}>
                {COST_KINDS.map((k) => (
                  <Pressable key={k.id} onPress={() => setBuy((f) => f && { ...f, kind: k.id })}
                    style={[styles.kindChip, buy?.kind === k.id && styles.kindChipOn]}>
                    <Text style={[styles.kindText, buy?.kind === k.id && { color: "#fff" }]}>{k.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <FieldLabel>{buy?.kind === "part" ? "Component details" : "Details"}</FieldLabel>
              <TextInput style={styles.input}
                placeholder={buy?.kind === "part" ? "What it is: make, model, size" : "e.g. Fuel to site and back, two helpers for the day"}
                placeholderTextColor={colors.textLight}
                value={buy?.description ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, description: t })} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {buy?.kind === "part" ? (
                <View style={{ width: 96 }}>
                  <FieldLabel>Quantity</FieldLabel>
                  <TextInput style={styles.input} keyboardType="number-pad" value={buy?.quantity ?? ""}
                    onChangeText={(t) => setBuy((f) => f && { ...f, quantity: t })} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <FieldLabel>Amount paid (PKR)</FieldLabel>
                <TextInput style={styles.input} keyboardType="decimal-pad" placeholder={buy?.kind === "part" ? "As on the receipt" : "What it came to"} placeholderTextColor={colors.textLight}
                  value={buy?.amount ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, amount: t })} />
              </View>
            </View>
            <View>
              <FieldLabel>{buy?.kind === "part" ? "Shop" : "Paid to"}</FieldLabel>
              <TextInput style={styles.input} placeholder={buy?.kind === "part" ? "Where it was bought (optional)" : "Who was paid (optional)"} placeholderTextColor={colors.textLight}
                value={buy?.shop ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, shop: t })} />
            </View>
            <View style={{ gap: 6 }}>
              <FieldLabel>{buy?.kind === "part" ? "Receipt" : "Receipt (if there is one)"}</FieldLabel>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Photograph" small variant="secondary" icon="camera-outline" style={{ flex: 1 }}
                  onPress={async () => { const a = await takePhoto(); if (a) setBuy((f) => f && { ...f, receipt: asUpload(a, "receipt.jpg"), receiptName: "photo taken" }); }} />
                <Button title="Pick a file" small variant="secondary" icon="folder-open-outline" style={{ flex: 1 }}
                  onPress={async () => { const a = await pickFromLibrary(); if (a) setBuy((f) => f && { ...f, receipt: asUpload(a, "receipt.jpg"), receiptName: a.fileName ?? "file chosen" }); }} />
              </View>
              {buy?.receipt ? <Text style={[styles.hint, { color: "#047857" }]}>Receipt attached: {buy.receiptName}</Text> : null}
            </View>
            {buy?.kind === "part" ? (
              <View style={{ gap: 6 }}>
                <FieldLabel>Component photo</FieldLabel>
                <Button title={buy?.photo ? "Retake the photo" : "Take a photo of the component"} small variant="secondary" icon="camera"
                  onPress={async () => { const a = await takePhoto(); if (a) setBuy((f) => f && { ...f, photo: asUpload(a, "component.jpg") }); }} />
                {buy?.photo ? <Text style={[styles.hint, { color: "#047857" }]}>Photo taken</Text> : null}
              </View>
            ) : null}
          </ScrollView>
          <Text style={styles.hint}>
            {buy?.kind === "part" ? "All four are needed: what it is, the amount, the receipt and the photo." : after}
          </Text>
          <View style={styles.modalActions}>
            <Button title="Cancel" small variant="secondary" onPress={() => setBuy(() => null)} />
            <Button title="Save cost" small icon="checkmark" onPress={onSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrap: { flex: 1, backgroundColor: "rgba(22,49,68,0.55)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kindChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.secondary },
  kindChipOn: { backgroundColor: colors.primary },
  kindText: { fontSize: font.xs, fontWeight: "700", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text, backgroundColor: colors.bg, fontFamily: "Urbanist_500Medium" },
  hint: { fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },
});
