import 'package:flutter/material.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';

class LoginScreen extends StatefulWidget {
  final String pharmacyName;
  final String pharmacyAddress;
  final ValueChanged<PharmacyUser> onLoginSuccess;

  const LoginScreen({
    super.key,
    this.pharmacyName = 'Clinix Community Pharmacy',
    this.pharmacyAddress = '17 KM Ferozepur Road, Lahore',
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _usernameCtrl =
      TextEditingController(text: 'user');
  final TextEditingController _pinCtrl = TextEditingController(text: '1111');
  final FocusNode _pinFocusNode = FocusNode();

  List<PharmacyUser> _activeUsers = [];
  bool _loadingUsers = true;
  bool _submitting = false;
  bool _showPin = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _pinCtrl.dispose();
    _pinFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    try {
      final all = await DatabaseHelper.instance.getUsers();
      if (!mounted) return;
      setState(() {
        _activeUsers = all.where((u) => u.isActive).toList();
        _loadingUsers = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingUsers = false);
    }
  }

  bool _isFactoryDefaultPin(PharmacyUser user) {
    final lower = user.username.trim().toLowerCase();
    return (lower == 'admin' && user.pinOrPassword == '1234') ||
        (lower == 'manager' && user.pinOrPassword == '2222') ||
        (lower == 'user' && user.pinOrPassword == '1111');
  }

  String _roleScopeSummary(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return 'Full access: POS, Profit view, Users & Roles, Backups & Settings';
      case UserRole.manager:
        return 'Manager: POS, Cost/Net Profit, Khata Ledger & Settings';
      case UserRole.salesStaff:
        return 'Sales Staff: POS Billing only (Cost & Net Profit hidden)';
      case UserRole.cashier:
        return 'Cashier: POS Billing only (Cost & Net Profit hidden)';
    }
  }

  void _handleQuickFill(PharmacyUser user) {
    setState(() {
      _usernameCtrl.text = user.username;
      if (_isFactoryDefaultPin(user)) {
        _pinCtrl.text = user.pinOrPassword;
      } else {
        _pinCtrl.clear();
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _pinFocusNode.requestFocus();
        });
      }
      _errorText = null;
    });
  }

  Future<void> _submit() async {
    final username = _usernameCtrl.text.trim();
    final pin = _pinCtrl.text.trim();
    if (username.isEmpty || pin.isEmpty) {
      setState(() {
        _errorText = 'Enter both Staff ID and PIN / Password to sign in.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      final matched =
          await DatabaseHelper.instance.authenticateUser(username, pin);
      if (!mounted) return;
      if (matched == null) {
        setState(() {
          _errorText =
              'Invalid Staff ID or PIN / Password. Check credentials or pick a staff profile.';
          _submitting = false;
        });
        return;
      }
      setState(() => _submitting = false);
      widget.onLoginSuccess(matched);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorText = e.toString().replaceFirst('Bad state: ', '');
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: Colors.grey.shade300),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Row(
                        children: [
                          Icon(
                            Icons.verified_user_outlined,
                            color: Color(0xFF0D7A5F),
                            size: 20,
                          ),
                          SizedBox(width: 8),
                          Text(
                            'OFFLINE PHARMACY POS TERMINAL',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.7,
                              color: Color(0xFF0D7A5F),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.pharmacyName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${widget.pharmacyAddress} · Staff Login',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      const Divider(height: 28),
                      if (_errorText != null) ...[
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.red.shade200),
                          ),
                          child: Text(
                            _errorText!,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.red.shade800,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextField(
                        controller: _usernameCtrl,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'Staff ID / Username',
                          prefixIcon: Icon(Icons.person_outline),
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _pinCtrl,
                        focusNode: _pinFocusNode,
                        obscureText: !_showPin,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: 'PIN / Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          border: const OutlineInputBorder(),
                          isDense: true,
                          suffixIcon: IconButton(
                            icon: Icon(
                              _showPin
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                            ),
                            onPressed: () =>
                                setState(() => _showPin = !_showPin),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 46,
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF0D7A5F),
                          ),
                          onPressed: _submitting ? null : _submit,
                          icon: const Icon(Icons.login),
                          label: Text(
                            _submitting ? 'Signing In...' : 'Sign In to POS',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Active Staff Accounts (${_activeUsers.length})',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_loadingUsers)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      else
                        ..._activeUsers.map((acc) {
                          final isSelected =
                              _usernameCtrl.text.trim().toLowerCase() ==
                                  acc.username.trim().toLowerCase();
                          final showCred = _isFactoryDefaultPin(acc);
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(10),
                              onTap: () => _handleQuickFill(acc),
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? const Color(0xFF0D7A5F).withOpacity(0.06)
                                      : Colors.grey.shade50,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? const Color(0xFF0D7A5F)
                                        : Colors.grey.shade300,
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            '${acc.name} · ${acc.role.label}',
                                            style: const TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        Text(
                                          showCred
                                              ? '${acc.username} / ${acc.pinOrPassword}'
                                              : '@${acc.username}',
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.grey.shade700,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _roleScopeSummary(acc.role),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
