import 'package:flutter/material.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';
import 'khata_statement_screen.dart';

class PartiesScreen extends StatefulWidget {
  final PharmacySettings settings;
  final PharmacyUser? currentUser;
  final VoidCallback? onOpenDrawer;

  const PartiesScreen({
    super.key,
    required this.settings,
    this.currentUser,
    this.onOpenDrawer,
  });

  @override
  State<PartiesScreen> createState() => _PartiesScreenState();
}

class _PartiesScreenState extends State<PartiesScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  List<Party> _parties = [];
  PartyType _activeType = PartyType.customer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadParties();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  String _fmt(double amount) =>
      CurrencyFormatter.format(amount, widget.settings);

  Future<void> _loadParties() async {
    setState(() => _loading = true);
    final rows = await DatabaseHelper.instance.getParties();
    if (!mounted) return;
    setState(() {
      _parties = rows;
      _loading = false;
    });
  }

  Future<void> _openKhata(Party party) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => KhataStatementScreen(
          party: party,
          settings: widget.settings,
          currentUser: widget.currentUser,
        ),
      ),
    );
    if (mounted) {
      await _loadParties();
    }
  }

  Future<void> _openAddPartyDialog() async {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final balCtrl = TextEditingController(text: '0');
    PartyType selectedType = _activeType;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add Customer or Supplier'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<PartyType>(
                  value: selectedType,
                  decoration: const InputDecoration(
                    labelText: 'Party Type',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: PartyType.customer,
                      child: Text('Customer (To Collect)'),
                    ),
                    DropdownMenuItem(
                      value: PartyType.supplier,
                      child: Text('Supplier (To Pay)'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      setDialogState(() => selectedType = v);
                    }
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Full Name / Clinic / Distributor',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone Number',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: balCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText:
                        'Opening Balance (${CurrencyFormatter.unitLabel(widget.settings)})',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              child: const Text('Save Party'),
            ),
          ],
        ),
      ),
    );

    if (saved == true && nameCtrl.text.trim().isNotEmpty) {
      final bal = double.tryParse(balCtrl.text.trim()) ?? 0.0;
      await DatabaseHelper.instance.insertParty(
        Party(
          name: nameCtrl.text.trim(),
          phone: phoneCtrl.text.trim(),
          type: selectedType,
          balance: bal < 0 ? 0.0 : bal,
        ),
      );
      await _loadParties();
    }

    nameCtrl.dispose();
    phoneCtrl.dispose();
    balCtrl.dispose();
  }

  Future<void> _openSettleDialog(Party party) async {
    if (party.id == null || party.balance <= 0) return;
    final amountCtrl = TextEditingController(
      text: party.balance.toStringAsFixed(widget.settings.decimalDigits),
    );
    final refCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String selectedMethod = 'Cash';
    DateTime selectedDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(
            party.type == PartyType.customer
                ? 'Record Collection (Vasooli)'
                : 'Record Supplier Payment',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${party.name}\nCurrent Balance: ${_fmt(party.balance)}',
                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText:
                        'Amount (${CurrencyFormatter.unitLabel(widget.settings)})',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedMethod,
                  decoration: const InputDecoration(
                    labelText: 'Payment Method',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'Cash', child: Text('Cash')),
                    DropdownMenuItem(
                      value: 'JazzCash / EasyPaisa',
                      child: Text('JazzCash / EasyPaisa'),
                    ),
                    DropdownMenuItem(
                      value: 'Bank Transfer',
                      child: Text('Bank Transfer'),
                    ),
                    DropdownMenuItem(value: 'Card', child: Text('Card')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      setDialogState(() => selectedMethod = v);
                    }
                  },
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2035),
                    );
                    if (picked != null) {
                      setDialogState(() => selectedDate = picked);
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Date',
                      border: OutlineInputBorder(),
                      isDense: true,
                      suffixIcon: Icon(Icons.calendar_today, size: 16),
                    ),
                    child: Text(
                      CurrencyFormatter.formatDate(
                        selectedDate.toIso8601String(),
                        widget.settings,
                      ),
                      style: const TextStyle(fontSize: 13.5),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: refCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Reference # (Optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Notes (Optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ),
    );

    if (confirmed == true) {
      final amt = double.tryParse(amountCtrl.text.trim()) ?? 0.0;
      if (amt > 0) {
        await DatabaseHelper.instance.recordPartySettlement(
          partyId: party.id!,
          amountPaidOrCollected: amt,
          paymentMode: selectedMethod,
          reference: refCtrl.text.trim(),
          notes: notesCtrl.text.trim(),
          collectedAt: selectedDate,
        );
        await _loadParties();
      }
    }

    amountCtrl.dispose();
    refCtrl.dispose();
    notesCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final toCollect = _parties
        .where((p) => p.type == PartyType.customer)
        .fold(0.0, (s, p) => s + p.balance);
    final toPay = _parties
        .where((p) => p.type == PartyType.supplier)
        .fold(0.0, (s, p) => s + p.balance);

    final query = _searchCtrl.text.trim().toLowerCase();
    final filtered = _parties.where((p) {
      if (p.type != _activeType) return false;
      if (query.isEmpty) return true;
      return p.name.toLowerCase().contains(query) ||
          p.phone.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: const Icon(Icons.menu),
                onPressed: widget.onOpenDrawer,
              )
            : null,
        title: const Text(
          'Parties & Khata Ledger',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            tooltip: 'Add Party',
            icon: const Icon(Icons.person_add_alt_1_outlined),
            onPressed: _openAddPartyDialog,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: _LedgerHeaderCard(
                          label: 'Total To Collect',
                          value: _fmt(toCollect),
                          accent: const Color(0xFF0D7A5F),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _LedgerHeaderCard(
                          label: 'Total To Pay',
                          value: _fmt(toPay),
                          accent: const Color(0xFFB45309),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      ChoiceChip(
                        label: const Text('Customers'),
                        selected: _activeType == PartyType.customer,
                        selectedColor:
                            const Color(0xFF0D7A5F).withOpacity(0.15),
                        onSelected: (_) =>
                            setState(() => _activeType = PartyType.customer),
                      ),
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: const Text('Suppliers'),
                        selected: _activeType == PartyType.supplier,
                        selectedColor:
                            const Color(0xFFD97706).withOpacity(0.15),
                        onSelected: (_) =>
                            setState(() => _activeType = PartyType.supplier),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: TextField(
                    controller: _searchCtrl,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: 'Search customer, clinic, or phone...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      isDense: true,
                    ),
                  ),
                ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadParties,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: filtered.length,
                      itemBuilder: (ctx, idx) {
                        final party = filtered[idx];
                        final isCustomer = party.type == PartyType.customer;
                        return Card(
                          elevation: 0,
                          margin: const EdgeInsets.only(bottom: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: Colors.grey.shade200),
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: isCustomer ? () => _openKhata(party) : null,
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              party.name,
                                              style: const TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              party.phone.isEmpty
                                                  ? 'No phone'
                                                  : party.phone,
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            party.balanceLabel,
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                          Text(
                                            _fmt(party.balance),
                                            style: TextStyle(
                                              fontSize: 14.5,
                                              fontWeight: FontWeight.w800,
                                              color: party.balance > 0
                                                  ? (isCustomer
                                                      ? const Color(0xFF0D7A5F)
                                                      : const Color(0xFFB45309))
                                                  : Colors.grey.shade500,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (isCustomer)
                                        OutlinedButton.icon(
                                          onPressed: () => _openKhata(party),
                                          icon: const Icon(
                                            Icons.receipt_long_outlined,
                                            size: 16,
                                          ),
                                          label: const Text('View Khata'),
                                        ),
                                      if (isCustomer && party.balance > 0)
                                        const SizedBox(width: 8),
                                      if (party.balance > 0)
                                        FilledButton(
                                          onPressed: () =>
                                              _openSettleDialog(party),
                                          style: FilledButton.styleFrom(
                                            backgroundColor:
                                                const Color(0xFF0D7A5F),
                                          ),
                                          child: Text(
                                            isCustomer
                                                ? 'Record Collection'
                                                : 'Record Payment',
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _LedgerHeaderCard extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;

  const _LedgerHeaderCard({
    required this.label,
    required this.value,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: accent,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
